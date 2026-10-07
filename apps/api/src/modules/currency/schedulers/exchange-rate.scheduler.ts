import {
  Injectable,
  Logger,
  Optional,
  type OnModuleInit,
} from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import {
  CronRegistryService,
  trackCronRun,
} from "../../../common/cron/cron-registry.service";
import { ExchangeRateService } from "../services/exchange-rate.service";

@Injectable()
export class ExchangeRateScheduler implements OnModuleInit {
  private readonly logger = new Logger(ExchangeRateScheduler.name);

  constructor(
    private readonly exchangeRateService: ExchangeRateService,
    // @Optional: testler scheduler'ı DI dışında elle `new`'leyebilir.
    @Optional() private readonly cronRegistry?: CronRegistryService,
  ) {}

  onModuleInit(): void {
    this.cronRegistry?.register(
      "currency.fetchDailyRates",
      "TCMB günlük kur çekimi",
      "iş günleri 16:00 + boot seed",
    );
  }

  /**
   * Her iş günü (Pzt-Cum) İstanbul saatiyle 16:00. TCMB ~15:30'da
   * yayınlar; 16:00 güvenli buffer.
   */
  @Cron("0 16 * * 1-5", { timeZone: "Europe/Istanbul" })
  async fetchDailyRates(): Promise<void> {
    return trackCronRun(
      this.cronRegistry,
      "currency.fetchDailyRates",
      async () => {
        this.logger.log("Daily TCMB cron triggered");
        const result = await this.exchangeRateService.refreshFromTcmb();
        if (!result.success) {
          this.logger.error(
            `TCMB cron başarısız (${result.reason ?? "unknown"}). Mevcut DB kuru kullanılmaya devam edilecek.`,
          );
          throw new Error(result.reason ?? "TCMB fetch failed");
        }
      },
    ).catch(() => {
      // Hata registry'ye işlendi; cron döngüsünü kırmamak için yutulur
      // (bir sonraki tetik yeniden dener, para yolu getFreshRate ile korunur).
    });
  }

  /**
   * HER açılıştan 30 sn sonra TCMB'den bir kez çeker (tabloda kayıt olsa da):
   * kaçırılmış bir cron ya da boş tablo bir sonraki deploy/yeniden başlatmada
   * kapanır. Yan etkisi: aynı günün MANUAL satırı varsa TCMB değeri üzerine
   * yazar (elle kur yalnız TCMB o günü yayınlamadıysa kalıcıdır).
   */
  async onApplicationBootstrap(): Promise<void> {
    setTimeout(() => {
      void this.bootSeed();
    }, 30_000);
  }

  private async bootSeed(): Promise<void> {
    try {
      const result = await this.exchangeRateService.refreshFromTcmb();
      if (result.success) {
        this.logger.log(
          `Boot fetch OK: USD=${result.rates?.USD} EUR=${result.rates?.EUR} (${result.date})`,
        );
      } else {
        this.logger.warn(
          `Boot fetch başarısız: ${result.reason}. Fallback kurları kullanılıyor.`,
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Boot exchange rate fetch error: ${msg}`);
    }
  }
}
