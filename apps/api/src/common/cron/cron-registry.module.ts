import { Global, Module } from "@nestjs/common";
import { CronLockService } from "./cron-lock.service";
import { CronRegistryService } from "./cron-registry.service";

/** @Global — her scheduler import etmeden enjekte edebilsin. */
@Global()
@Module({
  providers: [CronRegistryService, CronLockService],
  exports: [CronRegistryService, CronLockService],
})
export class CronRegistryModule {}
