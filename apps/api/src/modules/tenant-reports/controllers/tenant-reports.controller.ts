import {
  Body,
  Controller,
  Post,
  Query,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import {
  CurrentUser,
  type AuthenticatedUser,
} from "../../../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import {
  PermissionsGuard,
  RequirePermissions,
} from "../../auth/permissions/permissions.guard";
import { BidComparisonReportDto } from "../dto/bid-comparison-report.dto";
import { GeneralReportDto } from "../dto/general-report.dto";
import { SavingsReportDto } from "../dto/savings-report.dto";
import { ReportsExcelService } from "../services/reports-excel.service";
import { TenantReportsService } from "../services/tenant-reports.service";

// Not: PDF export kaldırıldı (Excel yeterli + Puppeteer/Chromium bağımlılığı).
type ExportFormat = "json" | "xlsx";

@Controller("tenants/me/reports")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TenantReportsController {
  constructor(
    private readonly service: TenantReportsService,
    private readonly excel: ReportsExcelService,
  ) {}

  // ---------------- GENEL İHALE RAPORU ----------------

  @Post("general")
  @RequirePermissions("reports:view")
  async general(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: GeneralReportDto,
    @Query("format") format: ExportFormat = "json",
    @Res({ passthrough: true }) res?: Response,
  ): Promise<unknown> {
    const data = await this.service.general(user.tenantId, dto);
    return this.respond(res, format, data, "genel-ihale-raporu", () =>
      this.excel.general(data),
    );
  }

  // ---------------- TASARRUF RAPORU ----------------

  @Post("savings")
  @RequirePermissions("reports:view")
  async savings(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SavingsReportDto,
    @Query("format") format: ExportFormat = "json",
    @Res({ passthrough: true }) res?: Response,
  ): Promise<unknown> {
    const data = await this.service.savings(user.tenantId, dto);
    return this.respond(res, format, data, "tasarruf-raporu", () =>
      this.excel.savings(data),
    );
  }

  // ---------------- TEKLİF KARŞILAŞTIRMA ----------------

  @Post("bid-comparison")
  @RequirePermissions("reports:view")
  async bidComparison(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: BidComparisonReportDto,
    @Query("format") format: ExportFormat = "json",
    @Res({ passthrough: true }) res?: Response,
  ): Promise<unknown> {
    const data = await this.service.bidComparison(user.tenantId, dto);
    return this.respond(res, format, data, "teklif-karsilastirma-raporu", () =>
      this.excel.bidComparison(data),
    );
  }

  // ---------------- yardımcı ----------------

  private async respond(
    res: Response | undefined,
    format: ExportFormat,
    data: unknown,
    baseFileName: string,
    generateXlsx: () => Promise<Buffer>,
  ): Promise<unknown> {
    // Sadece xlsx export; geri kalan her şey JSON döner.
    if (format !== "xlsx") return data;
    if (!res)
      throw new Error("Response object yok — Excel export için gerekli");

    const buffer = await generateXlsx();
    const ext = "xlsx";
    const mime =
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    const ts = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
    const filename = `${baseFileName}_${ts}.${ext}`;

    res.setHeader("Content-Type", mime);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename}"`,
    );
    res.setHeader("Content-Length", buffer.length);
    res.end(buffer);
    return undefined;
  }
}
