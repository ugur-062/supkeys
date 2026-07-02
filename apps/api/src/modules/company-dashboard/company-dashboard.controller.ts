import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import {
  CurrentCompanyUser,
  type AuthenticatedCompanyUser,
} from "../company-auth/decorators/current-company-user.decorator";
import { CompanyJwtAuthGuard } from "../company-auth/guards/company-jwt-auth.guard";
import { CompanyDashboardService } from "./company-dashboard.service";

@Controller("company/dashboard")
@UseGuards(CompanyJwtAuthGuard)
export class CompanyDashboardController {
  constructor(private readonly service: CompanyDashboardService) {}

  @Get("satinalma")
  satinalma(@CurrentCompanyUser() user: AuthenticatedCompanyUser) {
    return this.service.satinalma(user);
  }

  @Get("satis")
  satis(@CurrentCompanyUser() user: AuthenticatedCompanyUser) {
    return this.service.satis(user);
  }

  @Get("satis/stats")
  satisStats(@CurrentCompanyUser() user: AuthenticatedCompanyUser) {
    return this.service.satisStats(user);
  }

  @Get("satis/aktivite")
  satisAktivite(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Query("limit") limit?: string,
  ) {
    return this.service.satisAktivite(user, Number(limit) || 8);
  }

  @Get("satinalma/tasarruf")
  satinalmaTasarruf(@CurrentCompanyUser() user: AuthenticatedCompanyUser) {
    return this.service.satinalmaTasarruf(user);
  }

  @Get("satinalma/tedarikci")
  satinalmaTedarikci(@CurrentCompanyUser() user: AuthenticatedCompanyUser) {
    return this.service.satinalmaTedarikci(user);
  }
}
