import { Injectable, Logger, Optional, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { CronRegistryService, trackCronRun } from "../../common/cron/cron-registry.service";
import { DATA_RETENTION_JOB, DataRetentionService } from "./data-retention.service";

/** Boot catch-up delay: after start-up work, apart from the other catch-ups (30 s, 45 s). */
const BOOT_CATCH_UP_MS = 90_000;

/**
 * Nightly periodic destruction (`DataRetentionService`), 05:30 Istanbul -
 * after the other night jobs (sign-up purge 05:10). Through the shared
 * wrapper like every job: cron registry, alarm on failure, one run across
 * instances (advisory lock), no overlap inside one instance. Admin label:
 * `lib/cron-jobs.ts`.
 *
 * BOOT CATCH-UP (same reason as the AI retention jobs): a fixed-hour cron is
 * missed while the service sleeps or restarts, and the policy promises that
 * an expired record goes at the first run after its period. Every step is
 * idempotent, and a run with nothing to do writes no second imha record the
 * same day.
 *
 * Off (`DATA_RETENTION_PURGE_ENABLED`): the tick returns before the wrapper
 * (the registry shows a job that never ran here) and no catch-up is scheduled.
 */
@Injectable()
export class DataRetentionScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DataRetentionScheduler.name);
  private bootTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly retention: DataRetentionService,
    // @Optional: tests build the scheduler by hand, outside the DI container.
    @Optional() private readonly cronRegistry?: CronRegistryService,
  ) {}

  onModuleInit(): void {
    // Literal key: admin `cron-jobs.test` reads the registrations from the source.
    // Same value as `DATA_RETENTION_JOB` (unit test).
    this.cronRegistry?.register(
      "retention.purge",
      "Applies the retention periods of the data retention and destruction policy (deletes or strips expired personal data, writes an imha record)",
      "nightly 05:30 (Istanbul) + boot catch-up",
    );
    if (!this.retention.enabled) return;
    this.bootTimer = setTimeout(() => {
      this.bootTimer = null;
      void this.purge().catch((err: unknown) =>
        this.logger.warn(`Boot retention catch-up failed: ${err instanceof Error ? err.message : String(err)}`),
      );
    }, BOOT_CATCH_UP_MS);
    // Never keeps a process (a test, a script) alive on its own.
    this.bootTimer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.bootTimer) clearTimeout(this.bootTimer);
    this.bootTimer = null;
  }

  @Cron("30 5 * * *", { timeZone: "Europe/Istanbul" })
  async purge(): Promise<void> {
    if (!this.retention.enabled) return;
    return trackCronRun(this.cronRegistry, DATA_RETENTION_JOB, async () => {
      // Throws when a category failed (after the imha record), which is what
      // marks the run as failed here.
      await this.retention.run();
    });
  }
}
