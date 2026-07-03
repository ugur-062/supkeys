import { Module } from "@nestjs/common";
import { CompanyAuthModule } from "../company-auth/company-auth.module";
import { CompanyReportsController } from "./company-reports.controller";
import { CompanyReportsService } from "./company-reports.service";
import { ReportsExcelService } from "./reports-excel.service";

@Module({
  imports: [CompanyAuthModule],
  controllers: [CompanyReportsController],
  providers: [CompanyReportsService, ReportsExcelService],
})
export class CompanyReportsModule {}
