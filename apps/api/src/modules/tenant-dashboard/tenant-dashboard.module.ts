import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { TenantDashboardController } from "./controllers/tenant-dashboard.controller";
import { TenantDashboardService } from "./services/tenant-dashboard.service";

@Module({
  imports: [AuthModule],
  controllers: [TenantDashboardController],
  providers: [TenantDashboardService],
})
export class TenantDashboardModule {}
