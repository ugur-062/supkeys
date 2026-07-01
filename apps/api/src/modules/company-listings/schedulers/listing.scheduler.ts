import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { CompanyListingsService } from "../services/company-listings.service";

@Injectable()
export class ListingScheduler {
  private readonly logger = new Logger(ListingScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly listings: CompanyListingsService,
  ) {}

  /**
   * Her dakika — kapanış süresi geçmiş AÇIK ilanları teklife kapatır (CLOSED).
   * Sahip kazandırma kararını CLOSED durumunda verir (award OPEN|CLOSED kabul eder).
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async closeExpired(): Promise<void> {
    const due = await this.prisma.listing.findMany({
      where: { status: "OPEN", closesAt: { not: null, lt: new Date() } },
      select: { id: true },
    });
    if (due.length === 0) return;
    await this.prisma.listing.updateMany({
      where: { id: { in: due.map((l) => l.id) } },
      data: { status: "CLOSED" },
    });
    this.logger.log(`${due.length} ilan süre dolduğu için CLOSED'a alındı`);
    // Kapanış bildirimleri (davetliler + sahip) — fire-and-forget.
    for (const l of due) {
      void this.listings.notifyListingClosed(l.id).catch((err) =>
        this.logger.error(
          `Kapanış bildirimi gönderilemedi (${l.id}): ${
            err instanceof Error ? err.message : String(err)
          }`,
        ),
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
    await this.prisma.listing.updateMany({
      where: { id: { in: due.map((l) => l.id) } },
      data: { closingReminderSentAt: new Date() },
    });
    // Davetlilere kapanış hatırlatma e-postası (fire-and-forget).
    for (const l of due) {
      void this.listings.notifyListingInvitees(l.id, "reminder");
    }
    this.logger.log(`${due.length} ilan için kapanış hatırlatması gönderildi`);
  }
}
