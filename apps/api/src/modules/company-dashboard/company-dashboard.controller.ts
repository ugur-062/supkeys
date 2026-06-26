import { Controller, Get, UseGuards } from "@nestjs/common";
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
}
