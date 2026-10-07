import { Injectable, Logger, Optional, type OnModuleInit } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { CronRegistryService, trackCronRun } from "../cron/cron-registry.service";
import { SessionRevocationService } from "./session-revocation.service";

/**
 * İptal edilmiş oturum satırları, o oturumun hiçbir jetonu yaşayamayacak
 * hâle gelince gereksizdir — her gece silinir (tablo küçük kalır, kapıdaki
 * birincil-anahtar sorgusu ucuz kalır).
 */
@Injectable()
export class SessionRevocationScheduler implements OnModuleInit {
  private readonly logger = new Logger(SessionRevocationScheduler.name);
  constructor(
    private readonly sessions: SessionRevocationService,
    @Optional() private readonly cronRegistry?: CronRegistryService,
  ) {}

  onModuleInit(): void {
    this.cronRegistry?.register(
      "sessions.purgeRevoked",
      "Deletes revoked-session rows whose tokens have all expired",
      "nightly 04:50 (Istanbul)",
    );
  }

  @Cron("50 4 * * *", { timeZone: "Europe/Istanbul" })
  async purge(): Promise<void> {
    return trackCronRun(this.cronRegistry, "sessions.purgeRevoked", async () => {
      const n = await this.sessions.purgeExpired();
      if (n > 0) this.logger.log(`${n} süresi geçmiş oturum iptal kaydı silindi`);
    });
  }
}
