import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { CompanyViewsService, VIEW_RETENTION_DAYS } from "./company-views.service";

/** Görüntülenme kayıtları 180 gün tutulur — her gece temizlik. */
@Injectable()
export class CompanyViewsScheduler {
  private readonly logger = new Logger(CompanyViewsScheduler.name);
  constructor(private readonly views: CompanyViewsService) {}

  @Cron("20 4 * * *", { timeZone: "Europe/Istanbul" })
  async purge(): Promise<void> {
    try {
      const n = await this.views.purgeExpired();
      if (n > 0) this.logger.log(`${n} görüntülenme kaydı silindi (> ${VIEW_RETENTION_DAYS} gün)`);
    } catch (err) {
      this.logger.error(`[CRON-HATA] views.purge: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * "Hızlı yanıt veren" ölçüsü — gece yeniden hesaplanır.
   *
   * Temizlikten AYRI ifade (04:35): biri patlarsa öteki koşsun. Süzgeç
   * `Company.medianReplyHours`ten okuyor; hesap İş Analizi'ndekiyle aynı
   * yardımcıdan (`common/company/reply-time.ts`).
   */
  @Cron("35 4 * * *", { timeZone: "Europe/Istanbul" })
  async replyTimes(): Promise<void> {
    try {
      const { scanned, updated } = await this.views.recomputeReplyTimes();
      this.logger.log(`Yanıt süresi güncellendi: ${updated} firma (${scanned} talep tarandı)`);
    } catch (err) {
      this.logger.error(`[CRON-HATA] views.replyTimes: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
