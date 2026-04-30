import { Module } from "@nestjs/common";
import { EmailModule } from "../email/email.module";
import { AdminBuyerApplicationsController } from "./controllers/admin-buyer-applications.controller";
import { AdminSupplierApplicationsController } from "./controllers/admin-supplier-applications.controller";
import { AdminBuyerApplicationsService } from "./services/admin-buyer-applications.service";
import { AdminSupplierApplicationsService } from "./services/admin-supplier-applications.service";

@Module({
  imports: [EmailModule],
  controllers: [
    AdminBuyerApplicationsController,
    AdminSupplierApplicationsController,
  ],
  providers: [
    AdminBuyerApplicationsService,
    AdminSupplierApplicationsService,
  ],
})
export class AdminApplicationsModule {}
