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
import { PrismaBypassService } from "../../../common/prisma/prisma.service";
import { CompanyListingsService } from "../services/company-listings.service";
import { SeoIndexService } from "../../seo-index/seo-index.service";

@Injectable()
export class ListingScheduler implements OnModuleInit {
  private readonly logger = new Logger(ListingScheduler.name);

  constructor(
    private readonly prisma: PrismaBypassService,
    private readonly listings: CompanyListingsService,
    // @Optional: testler scheduler'ı DI dışında elle `new`'leyebilir.
    @Optional() private readonly cronRegistry?: CronRegistryService,
    // Kapanış/embargo açılışı herkese açık sayfayı değiştirir (teklife açık →
    // kapandı; noindex). @Optional: elle kurulan rig'ler kırılmasın.
    @Optional() private readonly seo?: SeoIndexService,
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
      "Değerlendirmedeki satın alma talebinde geçerliliği dolmak üzere olan teklifler için sahibe hatırlatma",
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
      // A5 fix: closesAt DAHİL kapalı — tam closesAt anında kapat (`lte`). placeBid
      // reddi de `>=` olduğundan sınır tek yönlü: ne "kapandıktan sonra açık"
      // penceresi ne de teklif-kabul boşluğu kalır.
      where: { status: "OPEN", closesAt: { not: null, lte: new Date() } },
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
        // closesAt claim anında YENİDEN denetlenir (derin denetim 2026-09-29
        // X14/S029): findMany ile claim arasında kapanış ileri alındıysa
        // (placeBid auto-extend, changeClosingTime) ilan uzatılmış hâliyle açık
        // kalır — "uzatıldı" bildiriminden hemen sonra kapanmaz.
        where: { id: l.id, status: "OPEN", closesAt: { not: null, lte: new Date() } },
        // Yeni değerlendirme penceresi → geçerlilik hatırlatması yeniden kurulur.
        data: { status: "IN_AWARD", evaluationReminderSentAt: null },
      });
      if (claimed.count !== 1) continue; // başka worker aldı → atla
      closed++;
      this.seo?.listingChanged(l.id);
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
      void this.listings.notifyListingInvitees(l.id, "reminder").catch((err) =>
        this.logger.warn(
          `Kapanış hatırlatma bildirimi başarısız (${l.id}): ${
            err instanceof Error ? err.message : String(err)
          }`,
        ),
      );
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

  /** Geçerlilik hatırlatması taramasında sayfa boyu (testte küçültülür). */
  private readonly validityReminderPageSize = 200;

  private async doEvaluationValidityReminders(): Promise<void> {
    const HORIZON_MS = 3 * 86_400_000;
    const now = Date.now();
    // Derin denetim MU-14: eskiden sırasız `take: 200` + JS süzgeci vardı;
    // hatırlatmaya hiç uymayan (teklifsiz / geçerlilik süresiz) IN_AWARD
    // ilanlar damgalanmadan pencereyi dolduruyor, 200'ü aşınca yenilere hiç
    // sıra gelmiyordu. Uygunluk sorguda süzülür ve TÜM adaylar imleçle gezilir.
    const candidates: Array<{
      id: string;
      bids: Array<{ submittedAt: Date | null; validityDays: number | null }>;
    }> = [];
    let cursor: string | undefined;
    for (;;) {
      const page = await this.prisma.listing.findMany({
        where: {
          status: "IN_AWARD",
          evaluationReminderSentAt: null,
          bids: { some: { status: "SUBMITTED", submittedAt: { not: null }, validityDays: { not: null } } },
        },
        select: {
          id: true,
          bids: {
            where: { status: "SUBMITTED" },
            select: { submittedAt: true, validityDays: true },
          },
        },
        orderBy: { id: "asc" },
        take: this.validityReminderPageSize,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      candidates.push(...page);
      if (page.length < this.validityReminderPageSize) break;
      cursor = page[page.length - 1]!.id;
    }
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
    const now = new Date();
    const due = await this.prisma.listing.findMany({
      where: {
        status: "OPEN",
        openNotifiedAt: null,
        AND: [
          // Kapanışı geçmiş talep duyurulmaz (claim aynı kuralı uygular, X08);
          // burada da süzülür ki take penceresini doldurmasın.
          { OR: [{ closesAt: null }, { closesAt: { gt: now } }] },
          {
            OR: [
              // Embargosu biten talep (açılış saati geldi).
              { bidsOpenAt: { not: null, lte: now } },
              // ANONİM DUYURUSU OTOMATİK DAVETİ BEKLEYEN talep (gözden geçirme
              // AI-4, `CompanyListingsService.holdForDiscovery`): açılış
              // tarihsiz, ilk turda, yayın turu yazılmış ama damgasız. Yayın
              // turu satırı damgadan ÖNCE yalnız bu yolda yazılır — eski
              // kayıtlarda bu şekil oluşmaz. Bekleme bellekte tutulmadığı için
              // süreç yeniden başlasa da duyuru buradan salınır: tur bittiyse
              // ya da 10 dakikayı aştıysa `announceListingOpen` claim'i alır;
              // tur sürüyorsa çağrı hiçbir şey göndermeden döner.
              {
                bidsOpenAt: null,
                currentRound: 1,
                discoveryRuns: { some: { trigger: { in: ["PUBLISH", "SECOND_ROUND"] } } },
              },
            ],
          },
        ],
      },
      select: { id: true, currentRound: true, bidsOpenAt: true },
      // Bekleyenler pencereyi doldurup embargosu biteni geciktirmesin.
      orderBy: [{ bidsOpenAt: { sort: "asc", nulls: "last" } }, { id: "asc" }],
      take: 100,
    });
    if (due.length === 0) return;
    let announced = 0;
    for (const l of due) {
      try {
        const out = await this.listings.announceListingOpen(
          l.id,
          l.currentRound > 1 ? "newRound" : "invitation",
        );
        // Bekleyen talep bu turda salınmadı: sayılmaz (dakikada bir "duyuruldu"
        // günlüğü olmasın). Arama motoru bildirimi yalnız embargosu biten
        // talep için (bekleyen talep yayınlandığı an zaten bildirildi).
        if (out?.status === "held") continue;
        announced++;
        if (l.bidsOpenAt) this.seo?.listingChanged(l.id);
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
