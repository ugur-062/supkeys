import { Global, Module } from "@nestjs/common";
import { DataRetentionScheduler } from "./data-retention.scheduler";
import { DataRetentionService } from "./data-retention.service";
import { RetentionRecordService } from "./retention-record.service";

/**
 * Kişisel Veri Saklama ve İmha Politikası: the nightly destruction job and the
 * imha record writer. @Global so the older purge jobs (views, AI, sessions,
 * sign-ups) can write their imha records without importing this module.
 */
@Global()
@Module({
  providers: [RetentionRecordService, DataRetentionService, DataRetentionScheduler],
  exports: [RetentionRecordService],
})
export class DataRetentionModule {}
