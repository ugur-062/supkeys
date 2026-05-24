import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { TenantReportsController } from "./controllers/tenant-reports.controller";
import { ReportsExcelService } from "./services/reports-excel.service";
import { TenantReportsService } from "./services/tenant-reports.service";

@Module({
  imports: [AuthModule],
  controllers: [TenantReportsController],
  providers: [TenantReportsService, ReportsExcelService],
})
export class TenantReportsModule {}
