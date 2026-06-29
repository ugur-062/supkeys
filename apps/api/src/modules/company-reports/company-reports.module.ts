import { Module } from "@nestjs/common";
import { CompanyAuthModule } from "../company-auth/company-auth.module";
import { CompanyReportsController } from "./company-reports.controller";
import { CompanyReportsService } from "./company-reports.service";

@Module({
  imports: [CompanyAuthModule],
  controllers: [CompanyReportsController],
  providers: [CompanyReportsService],
})
export class CompanyReportsModule {}
