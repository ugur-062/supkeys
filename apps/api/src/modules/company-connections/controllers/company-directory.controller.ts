import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import {
  CurrentCompanyUser,
  type AuthenticatedCompanyUser,
} from "../../company-auth/decorators/current-company-user.decorator";
import { RequireCompanyPermission } from "../../company-auth/decorators/require-company-permission.decorator";
import { CompanyPermissionsGuard } from "../../company-auth/guards/company-permissions.guard";
import { CompanyJwtAuthGuard } from "../../company-auth/guards/company-jwt-auth.guard";
import { CompanyConnectionsService } from "../services/company-connections.service";
import {
  PanelDirectoryFacetQueryDto,
  PanelDirectoryQueryDto,
  toDirectoryParams,
} from "../dto/panel-directory-query.dto";

/** Firma dizini — arama + herkese açık profil. Salt-okunur. */
@Controller("company/directory")
@UseGuards(CompanyJwtAuthGuard, CompanyPermissionsGuard)
export class CompanyDirectoryController {
  constructor(private readonly service: CompanyConnectionsService) {}

  /**
   * Dizin — public `/firmalar` ile AYNI süzgeçler; üyeye rothernId + bağlantı
   * durumu + `baglanti` süzgeci. Eskiden `gold`/`sort` yoktu ve `category`
   * tekildi: panel, public'in yapabildiğini yapamıyordu.
   */
  @Get("search")
  @RequireCompanyPermission(["buy:view", "sell:view"])
  search(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Query() query: PanelDirectoryQueryDto,
  ) {
    return this.service.searchCompanies(user, query.q, toDirectoryParams(query), query.connection);
  }

  @Get("search/facets")
  @RequireCompanyPermission(["buy:view", "sell:view"])
  searchFacets(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Query() query: PanelDirectoryFacetQueryDto,
  ) {
    return this.service.searchFacets(user, { ...toDirectoryParams(query), q: query.q }, query.connection);
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
