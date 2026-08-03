import { Module } from "@nestjs/common";
import { DashboardAnalyticsService } from "./dashboard-analytics.service";
import { TimeSavingsService } from "./time-savings.service";
import { CompanyAuthModule } from "../company-auth/company-auth.module";
import { CompanyDashboardController } from "./company-dashboard.controller";
import { CompanyDashboardService } from "./company-dashboard.service";

@Module({
  imports: [CompanyAuthModule],
  controllers: [CompanyDashboardController],
  providers: [CompanyDashboardService, TimeSavingsService, DashboardAnalyticsService],
})
export class CompanyDashboardModule {}
