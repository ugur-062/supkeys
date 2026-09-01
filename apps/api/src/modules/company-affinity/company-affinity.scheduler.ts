import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { CronRegistryService, trackCronRun } from "../../common/cron/cron-registry.service";
import { CompanyAffinityService } from "./company-affinity.service";

/**
 * İlgi profili gece yeniden hesabı.
 *
 * NEDEN CRON: skor hesabı sipariş/teklif/davet/katalog/ilan tablolarının
 * TAMAMINI tarar. Bunu istek yolunda yapmak her liste sorgusunu ağırlaştırır;
 * oysa ilgi günlük değişen bir şey — gecelik tazelik fazlasıyla yeterli.
 *
 * 03:20 seçildi: 03:00'daki üyelik düşürme işi bittikten SONRA koşsun —
 * o iş tier değiştirebiliyor ve tier öneri yüzeylerinin uygunluk kapısına
 * giriyor.
 */
@Injectable()
export class CompanyAffinityScheduler {
  private readonly logger = new Logger(CompanyAffinityScheduler.name);

  constructor(
    private readonly affinity: CompanyAffinityService,
    private readonly cronRegistry: CronRegistryService,
  ) {}

  @Cron("20 3 * * *", { timeZone: "Europe/Istanbul" })
  async recompute(): Promise<void> {
    return trackCronRun(this.cronRegistry, "affinity.recompute", async () => {
      const r = await this.affinity.recomputeAll();
      this.logger.log(`${r.companies} firma / ${r.rows} satır`);
    });
  }
}
