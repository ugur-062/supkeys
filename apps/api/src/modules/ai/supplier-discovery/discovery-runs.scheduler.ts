import { Injectable, Logger, Optional, type OnModuleInit } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { CronRegistryService, trackCronRun } from "../../../common/cron/cron-registry.service";
import { DiscoveryRunsService } from "./discovery-runs.service";

/**
 * AI tedarikçi keşfi turları — her dakika (2026-09-27, Faz 1): bekleyen
 * turları işler (arar, bulduğunu davet eder, alıcıya "N tedarikçi davet
 * edildi" bildirir), yarıda kalmış turu sürdürür, ikinci turu açar.
 */
@Injectable()
export class DiscoveryRunsScheduler implements OnModuleInit {
  private readonly logger = new Logger(DiscoveryRunsScheduler.name);

  constructor(
    private readonly runs: DiscoveryRunsService,
    @Optional() private readonly cronRegistry?: CronRegistryService,
  ) {}

  onModuleInit(): void {
    this.cronRegistry?.register(
      "discovery.runs",
      "AI supplier discovery runs (search and invite after publish, second round, result notice)",
      "her dakika",
    );
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async tick(): Promise<void> {
    return trackCronRun(this.cronRegistry, "discovery.runs", async () => {
      const r = await this.runs.tick();
      if (r.processed || r.notified || r.secondRounds || r.caughtUp) {
        this.logger.log(
          `discovery: processed=${r.processed} notified=${r.notified} secondRounds=${r.secondRounds} caughtUp=${r.caughtUp}`,
        );
      }
    });
  }
}
