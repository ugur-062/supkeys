import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Res,
  UseGuards,
} from "@nestjs/common";
import { ClientIp } from "../../common/http/client-ip.decorator";
import { ConfigService } from "@nestjs/config";
import { Throttle } from "@nestjs/throttler";
import { IsString, Length, MinLength } from "class-validator";
import type { Response } from "express";
import {
  CurrentAdmin,
  type AuthenticatedAdmin,
} from "../../common/decorators/current-admin.decorator";
import { clearAuthCookies } from "../../common/auth/cookie";
import { AdminAuthService } from "./admin-auth.service";
import { AllowAnyAdminRole } from "./decorators/allow-any-admin-role.decorator";
import { AdminLoginDto } from "./dto/admin-login.dto";
import { AdminJwtAuthGuard } from "./guards/admin-jwt-auth.guard";
import { AdminRolesGuard } from "./guards/admin-roles.guard";

class ChangePasswordDto {
  @IsString()
  @MinLength(1)
  current!: string;

  @IsString()
  @MinLength(12)
  next!: string;
}

class Enable2faDto {
  @IsString()
  @MinLength(16)
  secret!: string;

  @IsString()
  @Length(6, 6)
  code!: string;
}

class Disable2faDto {
  @IsString()
  @Length(6, 6)
  code!: string;
}

@Controller("admin/auth")
export class AdminAuthController {
  constructor(
    private readonly adminAuthService: AdminAuthService,
    private readonly config: ConfigService,
  ) {}

  @Post("logout")
  @HttpCode(HttpStatus.OK)
  logout(@Res({ passthrough: true }) res: Response) {
    clearAuthCookies(res, "admin", this.config);
    return { ok: true };
  }

  @Post("login")
  // V2-6.5 Fix #4 — brute-force koruması (10 deneme/dk per IP)
  @Throttle({ auth: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  login(
    @Body() dto: AdminLoginDto,
    @ClientIp() ip: string,
    @Headers("user-agent") userAgent: string,
  ) {
    return this.adminAuthService.login(dto, { ip, userAgent });
  }

  @Get("me")
  @UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
  @AllowAnyAdminRole()
  me(@CurrentAdmin() admin: AuthenticatedAdmin) {
    // 2FA durumu gibi taze alanlar için DB'den oku (JWT payload'ı bayat olabilir).
    return this.adminAuthService.getMe(admin.id);
  }

  // ── Hesap güvenliği (Faz 7) ──
  // #10 — Kimlik-doğrulanmış olsa da parola/2FA mutasyonları brute-force'a
  // açık (mevcut parola/TOTP kodu deneme yüzeyi). Sıkı per-route throttle
  // ekle; aksi halde global default'a (100/60s) düşerlerdi.
  @Post("change-password")
  @Throttle({ auth: { limit: 5, ttl: 60_000 } })
  @UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
  @AllowAnyAdminRole()
  @HttpCode(HttpStatus.OK)
  changePassword(
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.adminAuthService.changePassword(admin.id, dto.current, dto.next);
  }

  @Post("2fa/setup")
  @Throttle({ auth: { limit: 5, ttl: 60_000 } })
  @UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
  @AllowAnyAdminRole()
  @HttpCode(HttpStatus.OK)
  setup2fa(@CurrentAdmin() admin: AuthenticatedAdmin) {
    return this.adminAuthService.setupTwoFactor(admin.id);
  }

  @Post("2fa/enable")
  @Throttle({ auth: { limit: 5, ttl: 60_000 } })
  @UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
  @AllowAnyAdminRole()
  @HttpCode(HttpStatus.OK)
  enable2fa(
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Body() dto: Enable2faDto,
  ) {
    return this.adminAuthService.enableTwoFactor(admin.id, dto.secret, dto.code);
  }

  @Post("2fa/disable")
  @Throttle({ auth: { limit: 5, ttl: 60_000 } })
  @UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
  @AllowAnyAdminRole()
  @HttpCode(HttpStatus.OK)
  disable2fa(
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Body() dto: Disable2faDto,
  ) {
    return this.adminAuthService.disableTwoFactor(admin.id, dto.code);
  }
}
