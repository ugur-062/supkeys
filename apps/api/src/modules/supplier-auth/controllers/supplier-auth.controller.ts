import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Ip,
  Post,
  UseGuards,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import {
  CurrentSupplierUser,
  type AuthenticatedSupplierUser,
} from "../decorators/current-supplier-user.decorator";
import { SupplierLoginDto } from "../dto/supplier-login.dto";
import { SupplierVerifyOtpDto } from "../dto/two-factor.dto";
import { SupplierJwtAuthGuard } from "../guards/supplier-jwt-auth.guard";
import { SupplierAuthService } from "../services/supplier-auth.service";

@Controller("supplier-auth")
export class SupplierAuthController {
  constructor(private readonly service: SupplierAuthService) {}

  @Post("login")
  // V2-6.5 Fix #4 — brute-force koruması (10 deneme/dk per IP)
  @Throttle({ auth: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  login(
    @Body() dto: SupplierLoginDto,
    @Ip() ip: string,
    @Headers("user-agent") userAgent: string,
  ) {
    return this.service.login(dto, { ip, userAgent });
  }

  // Madde 29 — FAZ 3.3: login OTP doğrula (2FA açık kullanıcılar).
  @Post("verify-otp")
  @Throttle({ auth: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  verifyOtp(
    @Body() dto: SupplierVerifyOtpDto,
    @Ip() ip: string,
    @Headers("user-agent") userAgent: string,
  ) {
    return this.service.verifyLoginOtp(dto.challengeId, dto.code, {
      ip,
      userAgent,
    });
  }

  @Get("me")
  @UseGuards(SupplierJwtAuthGuard)
  me(@CurrentSupplierUser() user: AuthenticatedSupplierUser) {
    return this.service.getMe(user.supplierUserId);
  }

  // Madde 29 — 2FA aç/kapat (panel-içi).
  @Post("2fa/enable/start")
  @UseGuards(SupplierJwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  enableStart(@CurrentSupplierUser() user: AuthenticatedSupplierUser) {
    return this.service.startEnableTwoFactor(user.supplierUserId);
  }

  @Post("2fa/enable/verify")
  @UseGuards(SupplierJwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  enableVerify(
    @Body() dto: SupplierVerifyOtpDto,
    @CurrentSupplierUser() user: AuthenticatedSupplierUser,
  ) {
    return this.service.verifyEnableTwoFactor(
      user.supplierUserId,
      dto.challengeId,
      dto.code,
    );
  }

  @Post("2fa/disable")
  @UseGuards(SupplierJwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  disable(@CurrentSupplierUser() user: AuthenticatedSupplierUser) {
    return this.service.disableTwoFactor(user.supplierUserId);
  }
}
