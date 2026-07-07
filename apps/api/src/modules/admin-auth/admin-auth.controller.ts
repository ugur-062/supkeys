import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Ip,
  Post,
  Res,
  UseGuards,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Throttle } from "@nestjs/throttler";
import type { Response } from "express";
import {
  CurrentAdmin,
  type AuthenticatedAdmin,
} from "../../common/decorators/current-admin.decorator";
import { clearAuthCookies } from "../../common/auth/cookie";
import { AdminAuthService } from "./admin-auth.service";
import { AdminLoginDto } from "./dto/admin-login.dto";
import { AdminJwtAuthGuard } from "./guards/admin-jwt-auth.guard";

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
    @Ip() ip: string,
    @Headers("user-agent") userAgent: string,
  ) {
    return this.adminAuthService.login(dto, { ip, userAgent });
  }

  @Get("me")
  @UseGuards(AdminJwtAuthGuard)
  me(@CurrentAdmin() admin: AuthenticatedAdmin) {
    return admin;
  }
}
