import { Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { CronRegistryService, trackCronRun } from "../../common/cron/cron-registry.service";
import { PrismaBypassService } from "../../common/prisma/prisma.service";
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
export class CompanyAffinityScheduler implements OnModuleInit {
  private readonly logger = new Logger(CompanyAffinityScheduler.name);

  constructor(
    private readonly affinity: CompanyAffinityService,
    private readonly cronRegistry: CronRegistryService,
    private readonly prisma: PrismaBypassService,
  ) {}

  /**
   * Boot yakalaması — YALNIZ tablo hiç doldurulmamışsa.
   *
   * İlk dağıtımdan sonra (ve kategori yeniden kurulumu skorları sıfırlarsa)
   * öneri yüzeyleri gece 03:20'ye kadar boş kalmasın diye. "Her açılışta
   * hesapla" DEĞİL: hesap tüm sipariş/teklif/katalog tablolarını tarıyor ve
   * sık yeniden başlatmada boşa yük olurdu.
   */
  onModuleInit(): void {
    setTimeout(() => {
      void (async () => {
        try {
          const existing = await this.prisma.companyAffinity.count();
          if (existing > 0) return;
          this.logger.log("İlgi profili boş — ilk hesap koşuluyor");
          await this.affinity.recomputeAll();
        } catch (err) {
          this.logger.warn(
            `Boot ilgi hesabı başarısız: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        }
      })();
    }, 30_000);
  }

  @Cron("20 3 * * *", { timeZone: "Europe/Istanbul" })
  async recompute(): Promise<void> {
    return trackCronRun(this.cronRegistry, "affinity.recompute", async () => {
      const r = await this.affinity.recomputeAll();
      this.logger.log(`${r.companies} firma / ${r.rows} satır`);
    });
  }
}
