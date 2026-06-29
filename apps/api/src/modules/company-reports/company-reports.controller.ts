import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import {
  CurrentCompanyUser,
  type AuthenticatedCompanyUser,
} from "../company-auth/decorators/current-company-user.decorator";
import { RequireCompanyPermission } from "../company-auth/decorators/require-company-permission.decorator";
import { CompanyJwtAuthGuard } from "../company-auth/guards/company-jwt-auth.guard";
import { CompanyPermissionsGuard } from "../company-auth/guards/company-permissions.guard";
import { CompanyReportsService } from "./company-reports.service";

@Controller("company/reports")
@UseGuards(CompanyJwtAuthGuard, CompanyPermissionsGuard)
export class CompanyReportsController {
  constructor(private readonly service: CompanyReportsService) {}

  @Get("general")
  @RequireCompanyPermission("buy:bid:review")
  general(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Query("days") days?: string,
  ) {
    return this.service.general(user.companyId, days ? Number(days) : undefined);
  }

  @Get("savings")
  @RequireCompanyPermission("buy:bid:review")
  savings(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Query("days") days?: string,
  ) {
    return this.service.savings(user.companyId, days ? Number(days) : undefined);
  }
}
