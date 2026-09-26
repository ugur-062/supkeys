import { i18nMessage } from "../../common/i18n/http-i18n";
import { tApi } from "../../common/i18n/i18n.service";
import { DEFAULT_LOCALE } from "@rothern/i18n";
import { RequireTier } from "../company-auth/decorators/require-tier.decorator";
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
import { RequireCompanyPermission } from "../company-auth/decorators/require-company-permission.decorator";
import { hasCompanyPermission } from "../company-auth/permissions/company-permissions.constants";
import {
  CompanyReportsService,
  type BidComparisonInput,
  type GeneralReportInput,
  type SavingsReportInput,
} from "./company-reports.service";
import { ReportsExcelService } from "./reports-excel.service";

/**
 * Raporlar satınalma portalına hizmet eder (firmanın kendi alım talepleri).
 * İzin: "Satınalma raporları" (`buy:reports:view`) — Satın Almacı, Yönetici
 * ve Kurucu hazır setlerinde var; salt-okunur, koltuk tüketmez. POST —
 * kriter gövdede; /download uçları aynı kriterle xlsx döner.
 */
const REPORTS_PERMISSION = "buy:reports:view";

function assertAllowed(user: AuthenticatedCompanyUser) {
  if (!hasCompanyPermission(user, REPORTS_PERMISSION)) {
    throw new ForbiddenException(
      i18nMessage("api.companyReports.alimRaporlariIcinSatinalmaRaporlariYetkisi"),
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

const NAME_FOLD: Record<string, string> = {
  ç: "c",
  ğ: "g",
  ı: "i",
  ö: "o",
  ş: "s",
  ü: "u",
  Ç: "c",
  Ğ: "g",
  İ: "i",
  Ö: "o",
  Ş: "s",
  Ü: "u",
};

function asciiSlug(text: string) {
  return text
    .replace(/[çğıöşüÇĞİÖŞÜ]/g, (c) => NAME_FOLD[c] ?? c)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * İndirilen dosyanın adı da kullanıcıya görünür → istek dilinde üretilir.
 * `Content-Disposition` yalnız ASCII taşıyabildiği için çevrilen ad slug'a
 * indirgenir; Türkçe değerler zaten slug olduğundan TR çıktısı birebir aynı
 * kalır. Latin dışı bir ad (Kiril) slug'dan tümüyle düşerdi → yedek TÜRKÇE
 * addır, dosya hiçbir dilde yalnız tarihe inmez.
 */
function reportFile(key: Parameters<typeof tApi>[0]) {
  const slug = asciiSlug(tApi(key)) || asciiSlug(tApi(key, undefined, DEFAULT_LOCALE));
  return slug ? `${slug}-${stamp()}.xlsx` : `${stamp()}.xlsx`;
}

@Controller("company/reports")
@RequireTier("GOLD")
@RequireCompanyPermission(REPORTS_PERMISSION)
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
    return xlsx(res, reportFile("api.companyReports.dosyaGenelRapor"), buf);
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
    return xlsx(res, reportFile("api.companyReports.dosyaTasarrufRaporu"), buf);
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
    return xlsx(
      res,
      reportFile("api.companyReports.dosyaTeklifKarsilastirma"),
      buf,
    );
  }
}
