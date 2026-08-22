import { Module } from "@nestjs/common";
import { CompanyAuthModule } from "../company-auth/company-auth.module";
import { EmailModule } from "../email/email.module";
import { NotificationModule } from "../notifications/notification.module";
import { CompanyOrdersController } from "./controllers/company-orders.controller";
import { CompanyOrdersService } from "./services/company-orders.service";
import { OrderScheduler } from "./schedulers/order.scheduler";

@Module({
  imports: [CompanyAuthModule, EmailModule, NotificationModule],
  controllers: [CompanyOrdersController],
  providers: [CompanyOrdersService, OrderScheduler],
  // Faz AI-2: asistan araçları bu servisi kullanıcı kimliğiyle çağırır.
  exports: [CompanyOrdersService],
})
export class CompanyOrdersModule {}
