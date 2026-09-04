import {
  Body,
  Controller,
  ForbiddenException,
  Post,
  Res,
  StreamableFile,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import {
  CurrentCompanyUser,
  type AuthenticatedCompanyUser,
} from "../company-auth/decorators/current-company-user.decorator";
import { CompanyJwtAuthGuard } from "../company-auth/guards/company-jwt-auth.guard";
import { CompanyPaidTierGuard } from "../company-auth/guards/company-paid-tier.guard";
import { CompanyPermissionsGuard } from "../company-auth/guards/company-permissions.guard";
import { hasCompanyPermission, hasManagementRole } from "../company-auth/permissions/company-permissions.constants";
import {
  CompanyReportsService,
  type BidComparisonInput,
  type GeneralReportInput,
  type SavingsReportInput,
} from "./company-reports.service";
import { ReportsExcelService } from "./reports-excel.service";

/**
 * Raporlar satınalma portalına hizmet eder (firmanın kendi alım talepleri,
 * buy izni). POST — kriter gövdede; /download uçları aynı kriterle xlsx döner.
 */
function assertAllowed(user: AuthenticatedCompanyUser) {
  // Gözetim muafiyeti (ürün kararı 2026-07-27): Kurucu ve Yönetici, işlem
  // rolü taşımasa da raporları görebilir — raporlar SALT-OKUNUR yönetim
  // çıktısıdır (kapalı-zarf/işlem yetkisi gerektiren bir eylem içermez).
  if (user.isOwner || hasManagementRole(user.roles)) return;
  if (
    !hasCompanyPermission(
      user.roles,
      user.isOwner,
      "buy:bid:review",
      user.permissionsOverride,
    )
  ) {
    throw new ForbiddenException(
      "Alım raporları için satınalma yetkisi gerekir",
    );
  }
}

function xlsx(res: Response, filename: string, buffer: Buffer) {
  res.set({
    "Content-Type":
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": `attachment; filename="${filename}"`,
  });
  return new StreamableFile(buffer);
}

const stamp = () => new Date().toISOString().slice(0, 10);

@Controller("company/reports")
// Raporlar premium özelliğidir — STANDARD firma erişemez (yalnız teklif verir).
@UseGuards(CompanyJwtAuthGuard, CompanyPermissionsGuard, CompanyPaidTierGuard)
export class CompanyReportsController {
  constructor(
    private readonly service: CompanyReportsService,
    private readonly excel: ReportsExcelService,
  ) {}

  /** Hub özet grafikleri (denetim §10.5) — kriter yok. */
  @Post("summary")
  summary(@CurrentCompanyUser() user: AuthenticatedCompanyUser) {
    assertAllowed(user);
    return this.service.summary(user.companyId);
  }

  @Post("general")
  general(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Body() body: GeneralReportInput,
  ) {
    assertAllowed(user);
    return this.service.general(user.companyId, body);
  }

  @Post("general/download")
  async generalDownload(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Body() body: GeneralReportInput,
    @Res({ passthrough: true }) res: Response,
  ) {
    assertAllowed(user);
    const data = await this.service.general(user.companyId, body);
    const buf = await this.excel.general(data);
    return xlsx(res, `genel-rapor-${stamp()}.xlsx`, buf);
  }

  @Post("savings")
  savings(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Body() body: SavingsReportInput,
  ) {
    assertAllowed(user);
    return this.service.savings(user.companyId, body);
  }

  @Post("savings/download")
  async savingsDownload(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Body() body: SavingsReportInput,
    @Res({ passthrough: true }) res: Response,
  ) {
    assertAllowed(user);
    const data = await this.service.savings(user.companyId, body);
    const buf = await this.excel.savings(data);
    return xlsx(res, `tasarruf-raporu-${stamp()}.xlsx`, buf);
  }

  @Post("bid-comparison")
  bidComparison(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Body() body: BidComparisonInput,
  ) {
    assertAllowed(user);
    return this.service.bidComparison(user.companyId, body);
  }

  @Post("bid-comparison/download")
  async bidComparisonDownload(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Body() body: BidComparisonInput,
    @Res({ passthrough: true }) res: Response,
  ) {
    assertAllowed(user);
    const data = await this.service.bidComparison(user.companyId, body);
    const buf = await this.excel.bidComparison(data);
    return xlsx(res, `teklif-karsilastirma-${stamp()}.xlsx`, buf);
  }
}
