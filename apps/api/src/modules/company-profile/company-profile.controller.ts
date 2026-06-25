import { Body, Controller, Get, Patch, UseGuards } from "@nestjs/common";
import {
  CurrentCompanyUser,
  type AuthenticatedCompanyUser,
} from "../company-auth/decorators/current-company-user.decorator";
import { RequireCompanyPermission } from "../company-auth/decorators/require-company-permission.decorator";
import { CompanyJwtAuthGuard } from "../company-auth/guards/company-jwt-auth.guard";
import { CompanyPermissionsGuard } from "../company-auth/guards/company-permissions.guard";
import { UpdateCompanyProfileDto } from "./dto/update-company-profile.dto";
import { CompanyProfileService } from "./company-profile.service";

@Controller("company/profile")
@UseGuards(CompanyJwtAuthGuard, CompanyPermissionsGuard)
export class CompanyProfileController {
  constructor(private readonly service: CompanyProfileService) {}

  @Get()
  get(@CurrentCompanyUser() user: AuthenticatedCompanyUser) {
    return this.service.get(user.companyId);
  }

  @Patch()
  @RequireCompanyPermission("company:manage")
  update(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Body() dto: UpdateCompanyProfileDto,
  ) {
    return this.service.update(user.companyId, dto);
  }
}
