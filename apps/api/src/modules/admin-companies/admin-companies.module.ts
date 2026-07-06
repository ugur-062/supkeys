import { Module } from "@nestjs/common";
import { EmailModule } from "../email/email.module";
import { NotificationModule } from "../notifications/notification.module";
import { AdminCompaniesController } from "./admin-companies.controller";
import { AdminCompaniesService } from "./admin-companies.service";

@Module({
  imports: [EmailModule, NotificationModule],
  controllers: [AdminCompaniesController],
  providers: [AdminCompaniesService],
})
export class AdminCompaniesModule {}
