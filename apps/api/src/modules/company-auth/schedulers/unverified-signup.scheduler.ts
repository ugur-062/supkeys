import { Injectable, Optional, type OnModuleInit } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import {
  CronRegistryService,
  trackCronRun,
} from "../../../common/cron/cron-registry.service";
import {
  UNVERIFIED_SIGNUP_TTL_DAYS,
  UnverifiedSignupCleanupService,
} from "../services/unverified-signup-cleanup.service";

/**
 * Nightly removal of sign-ups whose e-mail was never verified
 * (`UnverifiedSignupCleanupService`). Through the shared wrapper like every
 * job: cron registry, alarm on failure, one run across instances (advisory
 * lock) and no overlap inside one instance. The registry key has its Turkish
 * label in admin `lib/cron-jobs.ts`.
 *
 * No catch-up at start-up: a missed night only delays the sweep by a day, and
 * an address that is needed meanwhile is released on demand (the lazy path at
 * sign-up and team invitation).
 *
 * The job runs only where the removal is switched on
 * (`UNVERIFIED_SIGNUP_PURGE_ENABLED`, read in the service). Off: the tick
 * returns before the wrapper, so the registry shows a job that never ran
 * here instead of a green run that did nothing.
 */
@Injectable()
export class UnverifiedSignupScheduler implements OnModuleInit {
  constructor(
    private readonly cleanup: UnverifiedSignupCleanupService,
    // @Optional: tests build the scheduler by hand, outside the DI container.
    @Optional() private readonly cronRegistry?: CronRegistryService,
  ) {}

  onModuleInit(): void {
    this.cronRegistry?.register(
      "signup.purgeUnverified",
      `Deletes sign-ups whose e-mail is still unverified after ${UNVERIFIED_SIGNUP_TTL_DAYS} days`,
      "nightly 05:10 (Istanbul)",
    );
  }

  @Cron("10 5 * * *", { timeZone: "Europe/Istanbul" })
  async purge(): Promise<void> {
    if (!this.cleanup.enabled) return;
    return trackCronRun(this.cronRegistry, "signup.purgeUnverified", async () => {
      // The service logs the totals (and a cap that was hit) and throws when
      // an account could not be removed, which is what marks the run as
      // failed here.
      await this.cleanup.purgeExpired();
    });
  }
}
