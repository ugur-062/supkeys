import { Global, Module } from "@nestjs/common";
import { CronRegistryService } from "./cron-registry.service";

/** @Global — her scheduler import etmeden enjekte edebilsin. */
@Global()
@Module({
  providers: [CronRegistryService],
  exports: [CronRegistryService],
})
export class CronRegistryModule {}
