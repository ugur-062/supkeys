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
import {
  COMPANY_PERMISSION_CATALOG,
  COMPANY_ROLE_PERMISSIONS,
} from "../company-auth/permissions/company-permissions.constants";
import { CompanyUsersService } from "./company-users.service";
import {
  InviteCompanyUserDto,
  SetUserActiveDto,
  UpdateUserDto,
  UpdateUserPermissionsDto,
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

  /** Atanabilir izin kataloğu + rol-varsayılan izinleri (Ayarlar izin editörü). */
  @Get("permission-catalog")
  permissionCatalog() {
    return {
      catalog: COMPANY_PERMISSION_CATALOG,
      roleDefaults: COMPANY_ROLE_PERMISSIONS,
    };
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

  @Patch(":id")
  @RequireCompanyPermission("users:manage")
  updateUser(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.service.updateUser(user, id, dto);
  }

  @Patch(":id/active")
  @RequireCompanyPermission("users:manage")
  setActive(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
    @Body() dto: SetUserActiveDto,
  ) {
    return this.service.setActive(user, id, dto.active);
  }

  /** Kişi-bazlı izin override — yalnızca firma sahibi (servis içinde doğrulanır). */
  @Patch(":id/permissions")
  @RequireCompanyPermission("users:manage")
  updatePermissions(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
    @Body() dto: UpdateUserPermissionsDto,
  ) {
    return this.service.updatePermissions(user, id, dto);
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
