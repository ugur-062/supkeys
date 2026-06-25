import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import {
  CurrentCompanyUser,
  type AuthenticatedCompanyUser,
} from "../../company-auth/decorators/current-company-user.decorator";
import { RequireCompanyPermission } from "../../company-auth/decorators/require-company-permission.decorator";
import { CompanyJwtAuthGuard } from "../../company-auth/guards/company-jwt-auth.guard";
import { CompanyPermissionsGuard } from "../../company-auth/guards/company-permissions.guard";
import { InviteConnectionDto } from "../dto/invite-connection.dto";
import { CompanyConnectionsService } from "../services/company-connections.service";

@Controller("company/connections")
@UseGuards(CompanyJwtAuthGuard, CompanyPermissionsGuard)
export class CompanyConnectionsController {
  constructor(private readonly service: CompanyConnectionsService) {}

  @Get()
  list(@CurrentCompanyUser() user: AuthenticatedCompanyUser) {
    return this.service.list(user.companyId);
  }

  @Get("incoming")
  incoming(@CurrentCompanyUser() user: AuthenticatedCompanyUser) {
    return this.service.listIncoming(user.companyId);
  }

  @Post("invite")
  @RequireCompanyPermission("connections:manage")
  invite(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Body() dto: InviteConnectionDto,
  ) {
    return this.service.invite(user, dto.supkeysId);
  }

  @Post(":id/accept")
  @RequireCompanyPermission("connections:manage")
  accept(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
  ) {
    return this.service.accept(user, id);
  }

  @Post(":id/reject")
  @RequireCompanyPermission("connections:manage")
  reject(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
  ) {
    return this.service.reject(user, id);
  }
}
