import { Module } from "@nestjs/common";
import { AdminSystemController } from "./admin-system.controller";
import { EmailModule } from "../email/email.module";

// ExchangeRateService (CurrencyModule), CronRegistryService (CronRegistryModule),
// AuditService (AuditModule) @Global'dan gelir. EmailSuppressionService için
// EmailModule import edilir (suppression türetmesi tek-kaynak).
@Module({
  imports: [EmailModule],
  controllers: [AdminSystemController],
})
export class AdminSystemModule {}
