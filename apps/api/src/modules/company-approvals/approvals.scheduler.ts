import {
  Injectable,
  Logger,
  Optional,
  type OnModuleInit,
} from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import {
  CronRegistryService,
  trackCronRun,
} from "../../common/cron/cron-registry.service";
import { CompanyApprovalsService } from "./company-approvals.service";

@Injectable()
export class ApprovalsScheduler implements OnModuleInit {
  private readonly logger = new Logger(ApprovalsScheduler.name);

  constructor(
    private readonly approvals: CompanyApprovalsService,
    // @Optional: testler scheduler'ı DI dışında elle `new`'leyebilir.
    @Optional() private readonly cronRegistry?: CronRegistryService,
  ) {}

  onModuleInit(): void {
    this.cronRegistry?.register(
      "approvals.remind",
      "Bekleyen onaylara hatırlatma",
      "günlük 09:00 + boot catch-up",
    );
    /**
     * Boot catch-up (denetim 2026-08-27 Parça 11): sabit saatli cron Render
     * free planında uykuda KAÇAR ve telafi edilmez. `remindPending` kendi
     * dedup'unu taşıdığı için (`lastReminderAt < now-24h`) fazladan koşum
     * çift hatırlatma üretmez — güvenli.
     */
    setTimeout(() => {
      void this.remind().catch((err: unknown) =>
        this.logger.warn(
          `Boot onay hatırlatma catch-up başarısız: ${
            err instanceof Error ? err.message : String(err)
          }`,
        ),
      );
    }, 60_000);
    this.cronRegistry?.register(
      "approvals.fallbackInactiveApprovers",
      "Pasif onaycıyı YONETICI'ye devret",
      "her dakika",
    );
  }

  /**
   * Her gün İstanbul saatiyle 09:00 — bekleyen onayların sırası gelen
   * onaycısına hatırlatma e-postası (günde en fazla bir kez).
   */
  @Cron("0 9 * * *", { timeZone: "Europe/Istanbul" })
  async remind(): Promise<void> {
    return trackCronRun(this.cronRegistry, "approvals.remind", async () => {
      const sent = await this.approvals.remindPending();
      if (sent > 0) {
        this.logger.log(`${sent} bekleyen onay için hatırlatma gönderildi`);
      }
    });
  }

  /**
   * Her dakika — bekleyen onay adımında onaycı pasif/silinmişse aktif
   * YONETICI'ye yeniden atar (onay zinciri tıkanmasın).
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async fallbackInactiveApprovers(): Promise<void> {
    return trackCronRun(
      this.cronRegistry,
      "approvals.fallbackInactiveApprovers",
      async () => {
        const n = await this.approvals.fallbackInactiveApprovers();
        if (n > 0) {
          this.logger.log(
            `${n} bekleyen onay adımı aktif YONETICI'ye devredildi`,
          );
        }
      },
    );
  }
}
