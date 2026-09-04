import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import {
  CurrentCompanyUser,
  type AuthenticatedCompanyUser,
} from "../../company-auth/decorators/current-company-user.decorator";
import { CompanyJwtAuthGuard } from "../../company-auth/guards/company-jwt-auth.guard";
import { CompanyConnectionsService } from "../services/company-connections.service";

/** Firma dizini — arama + herkese açık profil. Salt-okunur. */
@Controller("company/directory")
@UseGuards(CompanyJwtAuthGuard)
export class CompanyDirectoryController {
  constructor(private readonly service: CompanyConnectionsService) {}

  /** Dizin — public `/firmalar` ile aynı süzgeçler; üyeye rothernId + bağlantı durumu. */
  @Get("search")
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
  searchFacets(@CurrentCompanyUser() user: AuthenticatedCompanyUser) {
    return this.service.searchFacets(user);
  }

  @Get("companies/:rothernId")
  profile(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("rothernId") rothernId: string,
  ) {
    return this.service.getProfile(user, rothernId);
  }
}
