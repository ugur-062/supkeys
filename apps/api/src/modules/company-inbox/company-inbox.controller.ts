import { Controller, Get, UseGuards } from "@nestjs/common";
import {
  CurrentCompanyUser,
  type AuthenticatedCompanyUser,
} from "../company-auth/decorators/current-company-user.decorator";
import { CompanyJwtAuthGuard } from "../company-auth/guards/company-jwt-auth.guard";
import { CompanyInboxService } from "./company-inbox.service";

@Controller("company/inbox")
@UseGuards(CompanyJwtAuthGuard)
export class CompanyInboxController {
  constructor(private readonly service: CompanyInboxService) {}

  @Get()
  inbox(@CurrentCompanyUser() user: AuthenticatedCompanyUser) {
    return this.service.inbox(user);
  }
}
