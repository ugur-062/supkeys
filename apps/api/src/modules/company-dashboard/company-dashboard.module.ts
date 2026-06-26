import { Module } from "@nestjs/common";
import { CompanyAuthModule } from "../company-auth/company-auth.module";
import { CompanyDashboardController } from "./company-dashboard.controller";
import { CompanyDashboardService } from "./company-dashboard.service";

@Module({
  imports: [CompanyAuthModule],
  controllers: [CompanyDashboardController],
  providers: [CompanyDashboardService],
})
export class CompanyDashboardModule {}
