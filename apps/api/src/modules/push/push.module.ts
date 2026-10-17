import { Global, Module } from "@nestjs/common";
import { CompanyAuthModule } from "../company-auth/company-auth.module";
import { PushDeviceController } from "./push.controller";
import { PushDeviceService } from "./push-device.service";
import { PushService } from "./push.service";

/**
 * GLOBAL: `NotificationService` injects `PushService` as `@Optional()` (same
 * pattern as `ContentTranslationService`): no import chain, and hand-built
 * test rigs simply have no push.
 */
@Global()
@Module({
  imports: [CompanyAuthModule],
  controllers: [PushDeviceController],
  providers: [PushDeviceService, PushService],
  exports: [PushService, PushDeviceService],
})
export class PushModule {}
