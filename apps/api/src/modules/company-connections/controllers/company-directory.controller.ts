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

  @Get("search")
  search(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Query("q") q?: string,
  ) {
    return this.service.searchCompanies(user, q);
  }

  @Get("companies/:rothernId")
  profile(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("rothernId") rothernId: string,
  ) {
    return this.service.getProfile(user, rothernId);
  }
}
