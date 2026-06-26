import { HttpModule } from "@nestjs/axios";
import { Global, Module } from "@nestjs/common";
import { ExchangeRateController } from "./controllers/exchange-rate.controller";
import { ExchangeRateScheduler } from "./schedulers/exchange-rate.scheduler";
import { ExchangeRateService } from "./services/exchange-rate.service";
import { TcmbService } from "./services/tcmb.service";

@Global()
@Module({
  imports: [
    HttpModule.register({
      timeout: 15_000,
      maxRedirects: 3,
    }),
  ],
  providers: [TcmbService, ExchangeRateService, ExchangeRateScheduler],
  controllers: [ExchangeRateController],
  exports: [ExchangeRateService],
})
export class CurrencyModule {}
