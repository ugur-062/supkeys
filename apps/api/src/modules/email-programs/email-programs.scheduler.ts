import { Injectable, Logger, Optional, type OnModuleInit } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { CronRegistryService, trackCronRun } from "../../common/cron/cron-registry.service";
import { EmailProgramsService } from "./email-programs.service";

/**
 * Günlük e-posta programı — 15 dakikada bir (2026-09-27, Faz 2). Her alt iş
 * kendi zaman penceresini (alıcının yerel saati) ve tekilliğini kendi okur;
 * 15 dk sıklık yerel 10:00 / 18:00 pencerelerini her saat diliminde yakalar.
 */
@Injectable()
export class EmailProgramsScheduler implements OnModuleInit {
  private readonly logger = new Logger(EmailProgramsScheduler.name);

  constructor(
    private readonly programs: EmailProgramsService,
    @Optional() private readonly cronRegistry?: CronRegistryService,
  ) {}

  onModuleInit(): void {
    this.cronRegistry?.register(
      "emailPrograms.tick",
      "Daily email program (evening digest, onboarding tips, weekly views, zero-quote reminder)",
      "15 dakikada bir",
    );
  }

  @Cron("0 */15 * * * *")
  async tick(): Promise<void> {
    return trackCronRun(this.cronRegistry, "emailPrograms.tick", async () => {
      const r = await this.programs.tick();
      if (r.digests || r.lifecycle || r.weekly || r.zeroBid) {
        this.logger.log(`email programs: digests=${r.digests} lifecycle=${r.lifecycle} weekly=${r.weekly} zeroBid=${r.zeroBid}`);
      }
    });
  }
}
