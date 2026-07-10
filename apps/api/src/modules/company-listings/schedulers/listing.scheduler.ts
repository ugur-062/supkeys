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
  }

  /**
   * Her dakika — kapanış süresi geçmiş AÇIK ilanları teklife kapatır (CLOSED).
   * Sahip kazandırma kararını CLOSED durumunda verir (award OPEN|CLOSED kabul eder).
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
    // Her ilanı ATOMİK claim et: yalnız hâlâ OPEN iken CLOSED'a çeviren worker
    // bildirimi atar. Redis/dağıtık kilit yok; iki replica veya 1dk'dan uzun
    // süren run'ın overlap'inde koşulsuz updateMany davetlilere ÇİFT kapanış
    // e-postası atardı. Koşullu updateMany (status=OPEN) + count kontrolü bunu
    // tekilleştirir.
    let closed = 0;
    for (const l of due) {
      const claimed = await this.prisma.listing.updateMany({
        where: { id: l.id, status: "OPEN" },
        data: { status: "CLOSED" },
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
      this.logger.log(`${closed} ilan süre dolduğu için CLOSED'a alındı`);
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
}
