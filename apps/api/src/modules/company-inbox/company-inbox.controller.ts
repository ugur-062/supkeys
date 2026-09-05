import { Controller, Get, UseGuards } from "@nestjs/common";
import {
  CurrentCompanyUser,
  type AuthenticatedCompanyUser,
} from "../company-auth/decorators/current-company-user.decorator";
import { RequireCompanyPermission } from "../company-auth/decorators/require-company-permission.decorator";
import { CompanyPermissionsGuard } from "../company-auth/guards/company-permissions.guard";
import { CompanyJwtAuthGuard } from "../company-auth/guards/company-jwt-auth.guard";
import { CompanyInboxService } from "./company-inbox.service";

@Controller("company/inbox")
@UseGuards(CompanyJwtAuthGuard, CompanyPermissionsGuard)
export class CompanyInboxController {
  constructor(private readonly service: CompanyInboxService) {}

  @Get()
  @RequireCompanyPermission(["buy:view", "sell:view"])
  inbox(@CurrentCompanyUser() user: AuthenticatedCompanyUser) {
    return this.service.inbox(user);
  }
}
