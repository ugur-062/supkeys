import { Injectable, Logger, Optional, type OnModuleInit } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { CronRegistryService, trackCronRun } from "../../../common/cron/cron-registry.service";
import { ExternalInviteDispatcher } from "../services/external-invite-dispatcher.service";

/**
 * Kayıtsız adreslere talep daveti kuyruğu — her dakika (2026-09-27, Faz 0b).
 * Kurallar `external-invite-policy.ts`, uygulama `ExternalInviteDispatcher`.
 * Çift tetik kilidi `trackCronRun` üzerinden (ikinci API örneği aynı daveti
 * iki kez göndermesin).
 */
@Injectable()
export class ExternalInviteScheduler implements OnModuleInit {
  private readonly logger = new Logger(ExternalInviteScheduler.name);

  constructor(
    private readonly dispatcher: ExternalInviteDispatcher,
    @Optional() private readonly cronRegistry?: CronRegistryService,
  ) {}

  onModuleInit(): void {
    this.cronRegistry?.register(
      "externalInvite.dispatch",
      "Kayıtsız adreslere talep daveti e-postaları (kuyruk, mesai saati, sıklık freni, hatırlatma)",
      "her dakika",
    );
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async dispatch(): Promise<void> {
    return trackCronRun(this.cronRegistry, "externalInvite.dispatch", async () => {
      const r = await this.dispatcher.dispatch();
      if (r.sent || r.reminders || r.cancelled || r.resumed) {
        this.logger.log(
          `invites: sent=${r.sent} reminders=${r.reminders} deferred=${r.deferred} cancelled=${r.cancelled} resumed=${r.resumed} cap=${r.cap.cap}`,
        );
      }
    });
  }
}
