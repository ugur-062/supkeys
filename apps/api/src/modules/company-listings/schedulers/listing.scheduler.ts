import {
  Injectable,
  Logger,
  Optional,
  type OnModuleInit,
} from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import {
  CronRegistryService,
  trackCronRun,
} from "../../../common/cron/cron-registry.service";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { CompanyListingsService } from "../services/company-listings.service";

@Injectable()
export class ListingScheduler implements OnModuleInit {
  private readonly logger = new Logger(ListingScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly listings: CompanyListingsService,
    // @Optional: testler scheduler'ı DI dışında elle `new`'leyebilir.
    @Optional() private readonly cronRegistry?: CronRegistryService,
  ) {}

  onModuleInit(): void {
    this.cronRegistry?.register(
      "listing.closeExpired",
      "Süresi dolan AÇIK ilanları kapat",
      "her dakika",
    );
    this.cronRegistry?.register(
      "listing.closingReminders",
      "Kapanış hatırlatma e-postaları",
      "her dakika",
    );
    this.cronRegistry?.register(
      "listing.announceOpened",
      "Açılış saati gelen (embargolu) ilanların yayın duyurusu",
      "her dakika",
    );
    this.cronRegistry?.register(
      "listing.evaluationValidityReminders",
      "Değerlendirmedeki ihalede geçerliliği dolmak üzere olan teklifler için sahibe hatırlatma",
      "saatte bir",
    );
  }

  /**
   * Her dakika — kapanış süresi geçmiş AÇIK ilanları doğrudan DEĞERLENDİRMEYE
   * (IN_AWARD) alır. Ayrı bir "Kapandı" ara durumu yok: kapanan ihale
   * değerlendirmededir; sahip oradan kazandırır, sonuçsuz kapatır ya da yeni
   * tur açar.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async closeExpired(): Promise<void> {
    return trackCronRun(this.cronRegistry, "listing.closeExpired", () =>
      this.doCloseExpired(),
    );
  }

  private async doCloseExpired(): Promise<void> {
    const due = await this.prisma.listing.findMany({
      where: { status: "OPEN", closesAt: { not: null, lt: new Date() } },
      select: { id: true },
    });
    if (due.length === 0) return;
    // Her ilanı ATOMİK claim et: yalnız hâlâ OPEN iken IN_AWARD'a çeviren
    // worker bildirimi atar. Redis/dağıtık kilit yok; iki replica veya 1dk'dan
    // uzun süren run'ın overlap'inde koşulsuz updateMany davetlilere ÇİFT
    // kapanış e-postası atardı. Koşullu updateMany (status=OPEN) + count
    // kontrolü bunu tekilleştirir.
    let closed = 0;
    for (const l of due) {
      const claimed = await this.prisma.listing.updateMany({
        where: { id: l.id, status: "OPEN" },
        // Yeni değerlendirme penceresi → geçerlilik hatırlatması yeniden kurulur.
        data: { status: "IN_AWARD", evaluationReminderSentAt: null },
      });
      if (claimed.count !== 1) continue; // başka worker aldı → atla
      closed++;
      void this.listings.notifyListingClosed(l.id).catch((err) =>
        this.logger.error(
          `Kapanış bildirimi gönderilemedi (${l.id}): ${
            err instanceof Error ? err.message : String(err)
          }`,
        ),
      );
    }
    if (closed > 0) {
      this.logger.log(
        `${closed} ilan süre dolduğu için değerlendirmeye (IN_AWARD) alındı`,
      );
    }
  }

  /**
   * Her dakika — kapanışa `reminderMinutesBefore` dakika kalan AÇIK ilanlar için
   * hatırlatma damgası (idempotent). E-posta gönderimi Faz 8 (şablonlar) ile
   * bağlanacak; şimdilik damga + log.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async sendClosingReminders(): Promise<void> {
    return trackCronRun(this.cronRegistry, "listing.closingReminders", () =>
      this.doSendClosingReminders(),
    );
  }

  private async doSendClosingReminders(): Promise<void> {
    const now = Date.now();
    const candidates = await this.prisma.listing.findMany({
      where: {
        status: "OPEN",
        sendClosingReminder: true,
        closingReminderSentAt: null,
        reminderMinutesBefore: { not: null },
        closesAt: { not: null, gt: new Date() },
      },
      select: {
        id: true,
        closesAt: true,
        reminderMinutesBefore: true,
      },
    });
    // Her ilanın kendi penceresi farklı → JS'te filtrele.
    const due = candidates.filter((l) => {
      if (!l.closesAt || l.reminderMinutesBefore == null) return false;
      const windowStart = l.closesAt.getTime() - l.reminderMinutesBefore * 60_000;
      return now >= windowStart;
    });
    if (due.length === 0) return;
    // Atomik claim (closingReminderSentAt: null → şimdi): yalnız damgayı ilk
    // koyan worker hatırlatma atar → overlap/2-replica'da çift e-posta olmaz.
    let sent = 0;
    for (const l of due) {
      const claimed = await this.prisma.listing.updateMany({
        where: { id: l.id, closingReminderSentAt: null },
        data: { closingReminderSentAt: new Date() },
      });
      if (claimed.count !== 1) continue;
      sent++;
      void this.listings.notifyListingInvitees(l.id, "reminder");
    }
    if (sent > 0) {
      this.logger.log(`${sent} ilan için kapanış hatırlatması gönderildi`);
    }
  }

  /**
   * Her dakika — açılış saati (bidsOpenAt) gelmiş ama duyurusu yapılmamış
   * AÇIK ilanların yayın duyurusunu gönderir. Embargolu ilan (gelecek açılış)
   * yayında bildirimsiz bekler; görünürlüğü de bu andan itibaren açılır
   * (sellerTenders/getOne bidsOpenAt'e bakar). announceListingOpen idempotent
   * (openNotifiedAt damgası) → overlap'te çift duyuru olmaz.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async announceOpened(): Promise<void> {
    return trackCronRun(this.cronRegistry, "listing.announceOpened", () =>
      this.doAnnounceOpened(),
    );
  }

  /**
   * Saatte bir — DEĞERLENDİRMEDEKİ (IN_AWARD) ihalede geçerliliği 3 gün
   * içinde dolacak (ya da dolmuş) SUBMITTED teklif varsa SAHİBE tek seferlik
   * hatırlatma: "karar verin ya da tedarikçilerden uzatma isteyin".
   * İdempotency: evaluationReminderSentAt damgası (değerlendirmeye her yeni
   * alışta sıfırlanır → yeni pencere için yeniden kurulur).
   */
  @Cron(CronExpression.EVERY_HOUR)
  async evaluationValidityReminders(): Promise<void> {
    return trackCronRun(
      this.cronRegistry,
      "listing.evaluationValidityReminders",
      () => this.doEvaluationValidityReminders(),
    );
  }

  private async doEvaluationValidityReminders(): Promise<void> {
    const HORIZON_MS = 3 * 86_400_000;
    const now = Date.now();
    const candidates = await this.prisma.listing.findMany({
      where: { status: "IN_AWARD", evaluationReminderSentAt: null },
      select: {
        id: true,
        bids: {
          where: { status: "SUBMITTED" },
          select: { submittedAt: true, validityDays: true },
        },
      },
      take: 200,
    });
    let sent = 0;
    for (const l of candidates) {
      const expiring = l.bids.filter(
        (b) =>
          b.submittedAt != null &&
          b.validityDays != null &&
          b.submittedAt.getTime() + b.validityDays * 86_400_000 <=
            now + HORIZON_MS,
      ).length;
      if (expiring === 0) continue;
      // Atomik claim — overlap/2-replica'da çift hatırlatma olmaz.
      const claimed = await this.prisma.listing.updateMany({
        where: { id: l.id, evaluationReminderSentAt: null },
        data: { evaluationReminderSentAt: new Date() },
      });
      if (claimed.count !== 1) continue;
      sent++;
      void this.listings
        .notifyEvaluationValidityReminder(l.id, expiring)
        .catch((err) =>
          this.logger.error(
            `Değerlendirme hatırlatması gönderilemedi (${l.id}): ${
              err instanceof Error ? err.message : String(err)
            }`,
          ),
        );
    }
    if (sent > 0) {
      this.logger.log(
        `${sent} değerlendirmedeki ilan için geçerlilik hatırlatması gönderildi`,
      );
    }
  }

  private async doAnnounceOpened(): Promise<void> {
    const due = await this.prisma.listing.findMany({
      where: {
        status: "OPEN",
        openNotifiedAt: null,
        bidsOpenAt: { not: null, lte: new Date() },
      },
      select: { id: true, currentRound: true },
      take: 100,
    });
    if (due.length === 0) return;
    let announced = 0;
    for (const l of due) {
      try {
        await this.listings.announceListingOpen(
          l.id,
          l.currentRound > 1 ? "newRound" : "invitation",
        );
        announced++;
      } catch (err) {
        this.logger.error(
          `Açılış duyurusu gönderilemedi (${l.id}): ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
    if (announced > 0) {
      this.logger.log(`${announced} ilanın açılış duyurusu gönderildi`);
    }
  }
}
