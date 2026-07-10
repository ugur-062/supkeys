import { Module } from "@nestjs/common";
import { AdminSystemController } from "./admin-system.controller";

// Bağımlılıkların üçü de @Global modüllerden gelir: ExchangeRateService
// (CurrencyModule), CronRegistryService (CronRegistryModule), AuditService
// (AuditModule) — ekstra import gerekmez.
@Module({
  controllers: [AdminSystemController],
})
export class AdminSystemModule {}
