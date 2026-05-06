import { Module } from "@nestjs/common";
import { SupplierAuthModule } from "../supplier-auth/supplier-auth.module";
import { SupplierDashboardController } from "./controllers/supplier-dashboard.controller";
import { SupplierDashboardService } from "./services/supplier-dashboard.service";

@Module({
  imports: [SupplierAuthModule],
  controllers: [SupplierDashboardController],
  providers: [SupplierDashboardService],
})
export class SupplierDashboardModule {}
