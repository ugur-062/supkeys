import { Module } from "@nestjs/common";
import { CronRegistryModule } from "../../common/cron/cron-registry.module";
import { CompanyAffinityScheduler } from "./company-affinity.scheduler";
import { CompanyAffinityService } from "./company-affinity.service";

@Module({
  imports: [CronRegistryModule],
  providers: [CompanyAffinityService, CompanyAffinityScheduler],
  exports: [CompanyAffinityService],
})
export class CompanyAffinityModule {}
