import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Post,
  Res,
  StreamableFile,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import type { ListingType } from "@rothern/db";
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
 * Raporlar iki portala hizmet eder: type=ALIM (satınalma, buy izni) /
 * type=SATIS (satış, sell izni). POST — kriter gövdede; /download uçları
 * aynı kriterle xlsx döner.
 */
function parseType(type?: string): ListingType {
  if (type === "SATIS") return "SATIS";
  if (type === "ALIM" || type === undefined) return "ALIM";
  throw new BadRequestException("Geçersiz rapor tipi");
}

function assertTypeAllowed(user: AuthenticatedCompanyUser, type: ListingType) {
  // Gözetim muafiyeti (ürün kararı 2026-07-27): Kurucu ve Yönetici, işlem
  // rolü taşımasa da raporları görebilir — raporlar SALT-OKUNUR yönetim
  // çıktısıdır (kapalı-zarf/işlem yetkisi gerektiren bir eylem içermez).
  if (user.isOwner || hasManagementRole(user.roles)) return;
  const needed = type === "ALIM" ? "buy:bid:review" : "sell:listing:manage";
  if (
    !hasCompanyPermission(
      user.roles,
      user.isOwner,
      needed,
      user.permissionsOverride,
    )
  ) {
    throw new ForbiddenException(
      type === "ALIM"
        ? "Alım raporları için satınalma yetkisi gerekir"
        : "Satış raporları için satış yetkisi gerekir",
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

  /** Hub özet grafikleri (denetim §10.5) — kriter yok, tip yeter. */
  @Post("summary")
  summary(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Body() body: { type?: string },
  ) {
    const t = parseType(body.type);
    assertTypeAllowed(user, t);
    return this.service.summary(user.companyId, t);
  }

  @Post("general")
  general(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Body() body: GeneralReportInput & { type?: string },
  ) {
    const t = parseType(body.type);
    assertTypeAllowed(user, t);
    return this.service.general(user.companyId, t, body);
  }

  @Post("general/download")
  async generalDownload(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Body() body: GeneralReportInput & { type?: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const t = parseType(body.type);
    assertTypeAllowed(user, t);
    const data = await this.service.general(user.companyId, t, body);
    const buf = await this.excel.general(data);
    return xlsx(res, `genel-rapor-${stamp()}.xlsx`, buf);
  }

  @Post("savings")
  savings(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Body() body: SavingsReportInput & { type?: string },
  ) {
    const t = parseType(body.type);
    assertTypeAllowed(user, t);
    return this.service.savings(user.companyId, t, body);
  }

  @Post("savings/download")
  async savingsDownload(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Body() body: SavingsReportInput & { type?: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const t = parseType(body.type);
    assertTypeAllowed(user, t);
    const data = await this.service.savings(user.companyId, t, body);
    const buf = await this.excel.savings(data);
    return xlsx(
      res,
      `${t === "ALIM" ? "tasarruf" : "kazanc"}-raporu-${stamp()}.xlsx`,
      buf,
    );
  }

  @Post("bid-comparison")
  bidComparison(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Body() body: BidComparisonInput & { type?: string },
  ) {
    const t = parseType(body.type);
    assertTypeAllowed(user, t);
    return this.service.bidComparison(user.companyId, t, body);
  }

  @Post("bid-comparison/download")
  async bidComparisonDownload(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Body() body: BidComparisonInput & { type?: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const t = parseType(body.type);
    assertTypeAllowed(user, t);
    const data = await this.service.bidComparison(user.companyId, t, body);
    const buf = await this.excel.bidComparison(data);
    return xlsx(res, `teklif-karsilastirma-${stamp()}.xlsx`, buf);
  }
}
