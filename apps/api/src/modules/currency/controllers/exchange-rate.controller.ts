import { Controller, Get } from "@nestjs/common";
import { ExchangeRateService } from "../services/exchange-rate.service";

/**
 * Public endpoint — herkes (auth'lu olsa da olmasa da) kur okuyabilir.
 * Frontend'de useCurrentExchangeRates hook'undan çağrılır.
 */
@Controller("exchange-rates")
export class ExchangeRateController {
  constructor(private readonly service: ExchangeRateService) {}

  @Get("current")
  async getCurrent() {
    const rates = await this.service.getCurrentRates();
    return {
      rates,
      timestamp: new Date().toISOString(),
    };
  }
}
