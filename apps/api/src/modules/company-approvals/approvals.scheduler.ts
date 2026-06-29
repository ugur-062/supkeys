import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { CompanyApprovalsService } from "./company-approvals.service";

@Injectable()
export class ApprovalsScheduler {
  private readonly logger = new Logger(ApprovalsScheduler.name);

  constructor(private readonly approvals: CompanyApprovalsService) {}

  /**
   * Her gün İstanbul saatiyle 09:00 — bekleyen onayların sırası gelen
   * onaycısına hatırlatma e-postası (günde en fazla bir kez).
   */
  @Cron("0 9 * * *", { timeZone: "Europe/Istanbul" })
  async remind(): Promise<void> {
    const sent = await this.approvals.remindPending();
    if (sent > 0) {
      this.logger.log(`${sent} bekleyen onay için hatırlatma gönderildi`);
    }
  }

  /**
   * Her dakika — bekleyen onay adımında onaycı pasif/silinmişse aktif
   * YONETICI'ye yeniden atar (onay zinciri tıkanmasın).
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async fallbackInactiveApprovers(): Promise<void> {
    const n = await this.approvals.fallbackInactiveApprovers();
    if (n > 0) {
      this.logger.log(`${n} bekleyen onay adımı aktif YONETICI'ye devredildi`);
    }
  }
}
