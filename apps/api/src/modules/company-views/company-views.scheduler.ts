import { Injectable, Logger, Optional, type OnModuleInit } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { CronRegistryService, trackCronRun } from "../../common/cron/cron-registry.service";
import { CompanyViewsService, VIEW_RETENTION_DAYS } from "./company-views.service";

/**
 * Görüntülenme kayıtları 180 gün tutulur — her gece temizlik.
 *
 * İki iş de ortak sarmalayıcıdan (`trackCronRun`) geçer (yayın denetimi
 * 2026-09-28 Bölüm 0 B0-4 / Bölüm 7): kilitsiz koşuyor, cron kaydında ve
 * uyarılarda hiç görünmüyordu — hata yalnız günlüğe düşüyordu.
 */
@Injectable()
export class CompanyViewsScheduler implements OnModuleInit {
  private readonly logger = new Logger(CompanyViewsScheduler.name);
  constructor(
    private readonly views: CompanyViewsService,
    @Optional() private readonly cronRegistry?: CronRegistryService,
  ) {}

  onModuleInit(): void {
    this.cronRegistry?.register(
      "views.purge",
      `Görüntülenme kayıtlarını ${VIEW_RETENTION_DAYS} gün sonra siler`,
      "her gece 04:20 (İstanbul)",
    );
    this.cronRegistry?.register(
      "views.replyTimes",
      "Firmaların ortanca ilk yanıt süresini yeniden hesaplar (\"hızlı yanıt veren\")",
      "her gece 04:35 (İstanbul)",
    );
  }

  @Cron("20 4 * * *", { timeZone: "Europe/Istanbul" })
  async purge(): Promise<void> {
    return trackCronRun(this.cronRegistry, "views.purge", async () => {
      const n = await this.views.purgeExpired();
      if (n > 0) this.logger.log(`${n} görüntülenme kaydı silindi (> ${VIEW_RETENTION_DAYS} gün)`);
    });
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
    return trackCronRun(this.cronRegistry, "views.replyTimes", async () => {
      const { scanned, updated } = await this.views.recomputeReplyTimes();
      this.logger.log(`Yanıt süresi güncellendi: ${updated} firma (${scanned} talep tarandı)`);
    });
  }
}
