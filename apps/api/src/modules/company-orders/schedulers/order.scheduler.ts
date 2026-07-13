import { Injectable, Logger, Optional, type OnModuleInit } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import {
  CronRegistryService,
  trackCronRun,
} from "../../../common/cron/cron-registry.service";
import { CompanyOrdersService } from "../services/company-orders.service";

/**
 * Sipariş cron'ları. Şimdilik yalnız S7 vade hatırlatması (Faz 3): teslim
 * alınmış ama tam ödenmemiş Vadeli/Çek/kısmi-peşin siparişlerde vade
 * yaklaşınca alıcıya bir kez bildirim (idempotency servis içinde).
 */
@Injectable()
export class OrderScheduler implements OnModuleInit {
  private readonly logger = new Logger(OrderScheduler.name);

  constructor(
    private readonly orders: CompanyOrdersService,
    @Optional() private readonly cronRegistry?: CronRegistryService,
  ) {}

  onModuleInit(): void {
    this.cronRegistry?.register(
      "order.paymentDueReminders",
      "Vadesi yaklaşan (teslim alınmış, ödenmemiş) siparişlerde alıcıya hatırlatma",
      "saatte bir",
    );
  }

  @Cron(CronExpression.EVERY_HOUR)
  async sendPaymentDueReminders(): Promise<void> {
    return trackCronRun(this.cronRegistry, "order.paymentDueReminders", async () => {
      const sent = await this.orders.sendDuePaymentReminders();
      if (sent > 0) {
        this.logger.log(`${sent} sipariş için ödeme vadesi hatırlatması gönderildi`);
      }
    });
  }
}
