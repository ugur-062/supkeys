import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import {
  CurrentCompanyUser,
  type AuthenticatedCompanyUser,
} from "../company-auth/decorators/current-company-user.decorator";
import { RequireCompanyPermission } from "../company-auth/decorators/require-company-permission.decorator";
import { CompanyJwtAuthGuard } from "../company-auth/guards/company-jwt-auth.guard";
import { CompanyPermissionsGuard } from "../company-auth/guards/company-permissions.guard";
import { CompanyUsersService } from "./company-users.service";
import {
  InviteCompanyUserDto,
  UpdateUserRolesDto,
} from "./dto/company-user.dto";

@Controller("company/users")
@UseGuards(CompanyJwtAuthGuard, CompanyPermissionsGuard)
export class CompanyUsersController {
  constructor(private readonly service: CompanyUsersService) {}

  @Get()
  list(@CurrentCompanyUser() user: AuthenticatedCompanyUser) {
    return this.service.list(user.companyId);
  }

  @Post()
  @RequireCompanyPermission("users:manage")
  invite(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Body() dto: InviteCompanyUserDto,
  ) {
    return this.service.invite(user, dto);
  }

  @Patch(":id/roles")
  @RequireCompanyPermission("users:manage")
  updateRoles(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
    @Body() dto: UpdateUserRolesDto,
  ) {
    return this.service.updateRoles(user, id, dto);
  }

  @Delete(":id")
  @RequireCompanyPermission("users:manage")
  remove(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
  ) {
    return this.service.remove(user, id);
  }
}
