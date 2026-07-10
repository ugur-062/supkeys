import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";
import type { AdminRole } from "@rothern/db";
import {
  CurrentAdmin,
  type AuthenticatedAdmin,
} from "../../common/decorators/current-admin.decorator";
import { RequireAdminRole } from "./decorators/require-admin-role.decorator";
import { AdminJwtAuthGuard } from "./guards/admin-jwt-auth.guard";
import { AdminRolesGuard } from "./guards/admin-roles.guard";
import { AdminStaffService } from "./admin-staff.service";

const ROLES = ["SUPER_ADMIN", "SALES", "SUPPORT"] as const;

class CreateStaffDto {
  @IsEmail()
  @MaxLength(200)
  email!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  firstName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  lastName!: string;

  @IsIn(ROLES as unknown as string[])
  role!: AdminRole;
}

class SetRoleDto {
  @IsIn(ROLES as unknown as string[])
  role!: AdminRole;
}

class SetActiveDto {
  @IsBoolean()
  active!: boolean;
}

/** Personel yönetimi — TAMAMI yalnız SUPER_ADMIN. */
@Controller("admin/staff")
@UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
@RequireAdminRole("SUPER_ADMIN")
export class AdminStaffController {
  constructor(private readonly service: AdminStaffService) {}

  @Get()
  list() {
    return this.service.list();
  }

  @Post()
  create(
    @Body() dto: CreateStaffDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    return this.service.create(dto, admin.id);
  }

  @Post(":id/role")
  setRole(
    @Param("id") id: string,
    @Body() dto: SetRoleDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    return this.service.setRole(id, dto.role, admin.id);
  }

  @Post(":id/active")
  setActive(
    @Param("id") id: string,
    @Body() dto: SetActiveDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    return this.service.setActive(id, dto.active, admin.id);
  }

  @Post(":id/reset-password")
  resetPassword(
    @Param("id") id: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    return this.service.resetPassword(id, admin.id);
  }
}
