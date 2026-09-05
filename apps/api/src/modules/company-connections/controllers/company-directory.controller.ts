import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import {
  CurrentCompanyUser,
  type AuthenticatedCompanyUser,
} from "../../company-auth/decorators/current-company-user.decorator";
import { RequireCompanyPermission } from "../../company-auth/decorators/require-company-permission.decorator";
import { CompanyPermissionsGuard } from "../../company-auth/guards/company-permissions.guard";
import { CompanyJwtAuthGuard } from "../../company-auth/guards/company-jwt-auth.guard";
import { CompanyConnectionsService } from "../services/company-connections.service";

/** Firma dizini — arama + herkese açık profil. Salt-okunur. */
@Controller("company/directory")
@UseGuards(CompanyJwtAuthGuard, CompanyPermissionsGuard)
export class CompanyDirectoryController {
  constructor(private readonly service: CompanyConnectionsService) {}

  /** Dizin — public `/firmalar` ile aynı süzgeçler; üyeye rothernId + bağlantı durumu. */
  @Get("search")
  @RequireCompanyPermission(["buy:view", "sell:view"])
  search(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Query("q") q?: string,
    @Query("city") city?: string,
    @Query("category") category?: string,
    @Query("activity") activity?: string,
    @Query("verified") verified?: string,
    @Query("hasProducts") hasProducts?: string,
    @Query("page") page?: string,
  ) {
    const n = Number(page);
    return this.service.searchCompanies(user, q?.slice(0, 120), {
      city: city?.slice(0, 60) || undefined,
      category: category && /^\d{8}$/.test(category) ? category : undefined,
      activity: activity?.slice(0, 40) || undefined,
      verified: verified === "1",
      hasProducts: hasProducts === "1",
      page: Number.isFinite(n) && n > 0 ? Math.trunc(n) : undefined,
    });
  }

  @Get("search/facets")
  @RequireCompanyPermission(["buy:view", "sell:view"])
  searchFacets(@CurrentCompanyUser() user: AuthenticatedCompanyUser) {
    return this.service.searchFacets(user);
  }

  @Get("companies/:rothernId")
  @RequireCompanyPermission(["buy:view", "sell:view"])
  profile(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("rothernId") rothernId: string,
  ) {
    return this.service.getProfile(user, rothernId);
  }
}
