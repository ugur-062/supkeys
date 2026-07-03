import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Query,
  UseGuards,
} from "@nestjs/common";
import type { ListingType } from "@supkeys/db";
import {
  CurrentCompanyUser,
  type AuthenticatedCompanyUser,
} from "../company-auth/decorators/current-company-user.decorator";
import { CompanyJwtAuthGuard } from "../company-auth/guards/company-jwt-auth.guard";
import { CompanyPermissionsGuard } from "../company-auth/guards/company-permissions.guard";
import { hasCompanyPermission } from "../company-auth/permissions/company-permissions.constants";
import { CompanyReportsService } from "./company-reports.service";

/**
 * Raporlar iki portala da hizmet eder: type=ALIM alım raporları (satınalma,
 * buy izni), type=SATIS satış raporları (satış, sell izni). Dekoratör tek
 * izin desteklediğinden tip-bağımlı izin elle doğrulanır.
 */
function parseType(type?: string): ListingType {
  if (type === "SATIS") return "SATIS";
  if (type === "ALIM" || type === undefined) return "ALIM";
  throw new BadRequestException("Geçersiz rapor tipi");
}

function assertTypeAllowed(user: AuthenticatedCompanyUser, type: ListingType) {
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

@Controller("company/reports")
@UseGuards(CompanyJwtAuthGuard, CompanyPermissionsGuard)
export class CompanyReportsController {
  constructor(private readonly service: CompanyReportsService) {}

  @Get("general")
  general(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Query("days") days?: string,
    @Query("type") type?: string,
  ) {
    const t = parseType(type);
    assertTypeAllowed(user, t);
    return this.service.general(
      user.companyId,
      t,
      days ? Number(days) : undefined,
    );
  }

  @Get("savings")
  savings(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Query("days") days?: string,
    @Query("type") type?: string,
  ) {
    const t = parseType(type);
    assertTypeAllowed(user, t);
    return this.service.savings(
      user.companyId,
      t,
      days ? Number(days) : undefined,
    );
  }

  @Get("monthly")
  monthly(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Query("days") days?: string,
    @Query("type") type?: string,
  ) {
    const t = parseType(type);
    assertTypeAllowed(user, t);
    return this.service.monthly(
      user.companyId,
      t,
      days ? Number(days) : undefined,
    );
  }

  @Get("counterparties")
  counterparties(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Query("days") days?: string,
    @Query("type") type?: string,
  ) {
    const t = parseType(type);
    assertTypeAllowed(user, t);
    return this.service.counterparties(
      user.companyId,
      t,
      days ? Number(days) : undefined,
    );
  }

  @Get("orders-summary")
  ordersSummary(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Query("days") days?: string,
    @Query("type") type?: string,
  ) {
    const t = parseType(type);
    assertTypeAllowed(user, t);
    return this.service.ordersSummary(
      user.companyId,
      t,
      days ? Number(days) : undefined,
    );
  }

  /** İhale-bazlı detay — yalnız sahip; izin dönen ihale tipine göre doğrulanır. */
  @Get("listing/:id")
  async listingReport(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
  ) {
    const report = await this.service.listingReport(user.companyId, id);
    assertTypeAllowed(user, report.type);
    return report;
  }
}
