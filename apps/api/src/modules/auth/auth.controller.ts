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
  CurrentUser,
  type AuthenticatedUser,
} from "../../common/decorators/current-user.decorator";
import { AuthService } from "./auth.service";
import { ForgotPasswordDto } from "./dto/forgot-password.dto";
import { LoginDto } from "./dto/login.dto";
import { VerifyOtpDto } from "./dto/two-factor.dto";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("login")
  // V2-6.5 Fix #4 — Sıkı rate limit (10 deneme/dk per IP) brute-force koruması.
  @Throttle({ auth: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  login(
    @Body() dto: LoginDto,
    @Ip() ip: string,
    @Headers("user-agent") userAgent: string,
  ) {
    return this.authService.login(dto, { ip, userAgent });
  }

  @Post("forgot-password")
  // Brute-force/enumeration koruması: aynı limit'i forgot endpoint'ine de.
  @Throttle({ auth: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  // Madde 29 — FAZ 3.3: login OTP doğrula (2FA açık kullanıcılar).
  @Post("verify-otp")
  @Throttle({ auth: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  verifyOtp(
    @Body() dto: VerifyOtpDto,
    @Ip() ip: string,
    @Headers("user-agent") userAgent: string,
  ) {
    return this.authService.verifyLoginOtp(dto.challengeId, dto.code, {
      ip,
      userAgent,
    });
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.buildMe(user);
  }

  // Madde 29 — 2FA aç/kapat (panel-içi).
  @Post("2fa/enable/start")
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  enableStart(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.startEnableTwoFactor(user.id);
  }

  @Post("2fa/enable/verify")
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  enableVerify(
    @Body() dto: VerifyOtpDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.authService.verifyEnableTwoFactor(
      user.id,
      dto.challengeId,
      dto.code,
    );
  }

  @Post("2fa/disable")
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  disable(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.disableTwoFactor(user.id);
  }
}
