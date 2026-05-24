import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PdfModule } from "../pdf/pdf.module";
import { TenantReportsController } from "./controllers/tenant-reports.controller";
import { ReportsExcelService } from "./services/reports-excel.service";
import { TenantReportsService } from "./services/tenant-reports.service";

@Module({
  imports: [AuthModule, PdfModule],
  controllers: [TenantReportsController],
  providers: [TenantReportsService, ReportsExcelService],
})
export class TenantReportsModule {}
