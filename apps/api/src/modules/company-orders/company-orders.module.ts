import { Module } from "@nestjs/common";
import { CompanyAuthModule } from "../company-auth/company-auth.module";
import { EmailModule } from "../email/email.module";
import { NotificationModule } from "../notifications/notification.module";
import { StorageModule } from "../storage/storage.module";
import { CompanyOrderDocumentsController } from "./company-order-documents.controller";
import { CompanyOrderDocumentsService } from "./company-order-documents.service";
import { CompanyOrdersController } from "./controllers/company-orders.controller";
import { CompanyOrdersService } from "./services/company-orders.service";

@Module({
  imports: [CompanyAuthModule, StorageModule, EmailModule, NotificationModule],
  controllers: [CompanyOrdersController, CompanyOrderDocumentsController],
  providers: [CompanyOrdersService, CompanyOrderDocumentsService],
})
export class CompanyOrdersModule {}
