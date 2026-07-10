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
import {
  CurrentAdmin,
  type AuthenticatedAdmin,
} from "../../common/decorators/current-admin.decorator";
import { RequireAdminRole } from "../admin-auth/decorators/require-admin-role.decorator";
import { AdminJwtAuthGuard } from "../admin-auth/guards/admin-jwt-auth.guard";
import { AdminRolesGuard } from "../admin-auth/guards/admin-roles.guard";
import { AdminCompanyUsersService } from "./admin-company-users.service";

class SetActiveDto {
  @IsBoolean()
  active!: boolean;
}

class ChangeEmailDto {
  @IsEmail()
  @MaxLength(200)
  email!: string;
}

class AddUserDto {
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

  @IsIn(["YONETICI", "SATIN_ALMACI", "SATISCI", "ONAYLAYICI"])
  role!: string;
}

/**
 * Kullanıcı kurtarma uçları. Rol ayrımı: okuma + zararsız kurtarma
 * (şifre reset / doğrulama resend / oturum düşürme) SUPPORT dahil; hesap
 * durumu/e-posta/üye ekleme gibi YAZAN işlemler SUPER_ADMIN + SALES.
 */
@Controller("admin/companies/:companyId/users")
@UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
export class AdminCompanyUsersController {
  constructor(private readonly service: AdminCompanyUsersService) {}

  @Get()
  list(@Param("companyId") companyId: string) {
    return this.service.list(companyId);
  }

  @Post(":userId/password-reset")
  sendPasswordReset(
    @Param("companyId") companyId: string,
    @Param("userId") userId: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    return this.service.sendPasswordReset(companyId, userId, admin.id);
  }

  @Post(":userId/resend-verification")
  resendVerification(
    @Param("companyId") companyId: string,
    @Param("userId") userId: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    return this.service.resendVerification(companyId, userId, admin.id);
  }

  @Post(":userId/drop-sessions")
  dropSessions(
    @Param("companyId") companyId: string,
    @Param("userId") userId: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    return this.service.dropSessions(companyId, userId, admin.id);
  }

  @Post(":userId/active")
  @RequireAdminRole("SUPER_ADMIN", "SALES")
  setActive(
    @Param("companyId") companyId: string,
    @Param("userId") userId: string,
    @Body() dto: SetActiveDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    return this.service.setActive(companyId, userId, dto.active, admin.id);
  }

  @Post(":userId/email")
  @RequireAdminRole("SUPER_ADMIN", "SALES")
  changeEmail(
    @Param("companyId") companyId: string,
    @Param("userId") userId: string,
    @Body() dto: ChangeEmailDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    return this.service.changeEmail(companyId, userId, dto.email, admin.id);
  }

  @Post()
  @RequireAdminRole("SUPER_ADMIN", "SALES")
  addUser(
    @Param("companyId") companyId: string,
    @Body() dto: AddUserDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    return this.service.addUser(companyId, dto, admin.id);
  }
}
