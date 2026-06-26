import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { ExchangeRateService } from "../services/exchange-rate.service";

@Injectable()
export class ExchangeRateScheduler {
  private readonly logger = new Logger(ExchangeRateScheduler.name);

  constructor(private readonly exchangeRateService: ExchangeRateService) {}

  /**
   * Her iş günü (Pzt-Cum) İstanbul saatiyle 16:00. TCMB ~15:30'da
   * yayınlar; 16:00 güvenli buffer.
   */
  @Cron("0 16 * * 1-5", { timeZone: "Europe/Istanbul" })
  async fetchDailyRates(): Promise<void> {
    this.logger.log("Daily TCMB cron triggered");
    const result = await this.exchangeRateService.refreshFromTcmb();
    if (!result.success) {
      this.logger.error(
        `TCMB cron başarısız (${result.reason ?? "unknown"}). Mevcut DB kuru kullanılmaya devam edilecek.`,
      );
    }
  }

  /**
   * Boot'ta DB'de hiç kur yoksa bir kez fetch dene. Her boot'ta TCMB'yi
   * gereksiz yere yormamak için DB'de kayıt varsa atlar.
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
