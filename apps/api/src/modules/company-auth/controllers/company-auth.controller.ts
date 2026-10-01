import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Res,
  UseGuards,
} from "@nestjs/common";
import { ClientIp } from "../../../common/http/client-ip.decorator";
import { ConfigService } from "@nestjs/config";
import { Throttle } from "@nestjs/throttler";
import type { Response } from "express";
import { clearAuthCookies } from "../../../common/auth/cookie";
import {
  CurrentCompanyUser,
  type AuthenticatedCompanyUser,
} from "../decorators/current-company-user.decorator";
import {
  AcceptTermsDto,
  ChangePasswordDto,
  TwoFactorCodeDto,
  UpdateMeDto,
  UpdateNotificationPrefsDto,
} from "../dto/account.dto";
import { CompanyLoginDto } from "../dto/company-login.dto";
import {
  ChangeSignupEmailDto,
  CompanySignupDto,
  ResendEmailCodeDto,
  VerifyEmailDto,
} from "../dto/company-signup.dto";
import { CompleteOnboardingDto, ViesCheckDto } from "../dto/onboarding.dto";
import { RequireCompanyPermission } from "../decorators/require-company-permission.decorator";
import { CompanyJwtAuthGuard } from "../guards/company-jwt-auth.guard";
import { CompanyPermissionsGuard } from "../guards/company-permissions.guard";
import { CompanyAuthService } from "../services/company-auth.service";
import { PasswordResetService } from "../../password-reset/password-reset.service";
import { CompanyForgotPasswordDto } from "../dto/company-forgot-password.dto";

@Controller("company-auth")
export class CompanyAuthController {
  constructor(
    private readonly service: CompanyAuthService,
    private readonly passwordReset: PasswordResetService,
    private readonly config: ConfigService,
  ) {}

  @Post("logout")
  @HttpCode(HttpStatus.OK)
  logout(@Res({ passthrough: true }) res: Response) {
    clearAuthCookies(res, "company", this.config);
    return { ok: true };
  }

  @Post("forgot-password")
  @Throttle({ auth: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  forgotPassword(@Body() dto: CompanyForgotPasswordDto) {
    return this.passwordReset.requestForCompany(dto.email);
  }

  @Post("signup")
  @Throttle({ auth: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.CREATED)
  signup(
    @Body() dto: CompanySignupDto,
    @ClientIp() ip: string,
    @Headers("user-agent") userAgent: string,
  ) {
    return this.service.signup(dto, { ip, userAgent });
  }

  @Post("verify-email")
  @Throttle({ auth: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.service.verifyEmail(dto.email, dto.code);
  }

  @Post("resend-email-code")
  @Throttle({ auth: { limit: 3, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  resendEmailCode(@Body() dto: ResendEmailCodeDto) {
    return this.service.resendEmailCode(dto.email);
  }

  // Doğrulanmamış kaydın e-postasını düzelt — ikinci firma + yetim hesap
  // açılmasın (derin denetim LU-22). Parola doğrulaması içerir → sıkı kota.
  @Post("signup/change-email")
  @Throttle({ auth: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  changeSignupEmail(@Body() dto: ChangeSignupEmailDto, @ClientIp() ip: string) {
    return this.service.changeSignupEmail(dto, { ip });
  }

  @Post("login")
  @Throttle({ auth: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  login(
    @Body() dto: CompanyLoginDto,
    @ClientIp() ip: string,
    @Headers("user-agent") userAgent: string,
  ) {
    return this.service.login(dto, { ip, userAgent });
  }

  @Get("me")
  @UseGuards(CompanyJwtAuthGuard)
  me(@CurrentCompanyUser() user: AuthenticatedCompanyUser) {
    return this.service.getMe(user.userId);
  }

  @Post("onboarding")
  @UseGuards(CompanyJwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  completeOnboarding(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Body() dto: CompleteOnboardingDto,
  ) {
    return this.service.completeOnboarding(user.userId, user.companyId, dto);
  }

  @Post("upgrade-premium")
  @UseGuards(CompanyJwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  upgradePremium(@CurrentCompanyUser() user: AuthenticatedCompanyUser) {
    return this.service.upgradeToPremium(user.userId, user.companyId);
  }

  // Firma kaydına (audit) yazan sorgu → firma yönetim izni (arayüz testi
  // D-187: onaylayıcı/görüntüleyici de çağırıp denetim izine satır düşürüyordu).
  // Onboarding'i yalnız Kurucu yapar; Kurucu company:manage'ı örtük taşır.
  @Post("vies-check")
  @UseGuards(CompanyJwtAuthGuard, CompanyPermissionsGuard)
  @RequireCompanyPermission("company:manage")
  @Throttle({ auth: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  viesCheck(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Body() dto: ViesCheckDto,
  ) {
    // Sonuç firmanın audit izine yazılır (admin incelemesi görür).
    return this.service.viesCheck(dto.countryCode, dto.vatNumber, {
      companyId: user.companyId,
      userId: user.userId,
      source: "manual",
    });
  }

  @Patch("me")
  @UseGuards(CompanyJwtAuthGuard)
  updateMe(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Body() dto: UpdateMeDto,
  ) {
    return this.service.updateMe(user.userId, dto);
  }

  /** Sözleşme onayı — onay izi olmayan hesabın ilk girişteki kapısı (MU-04). */
  @Post("accept-terms")
  @UseGuards(CompanyJwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  acceptTerms(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Body() dto: AcceptTermsDto,
  ) {
    return this.service.acceptTerms(user.userId, dto);
  }

  @Patch("me/notifications")
  @UseGuards(CompanyJwtAuthGuard)
  updateNotifications(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Body() dto: UpdateNotificationPrefsDto,
  ) {
    return this.service.updateNotificationPrefs(user.userId, dto.prefs);
  }

  @Post("change-password")
  @Throttle({ auth: { limit: 5, ttl: 60_000 } })
  @UseGuards(CompanyJwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  changePassword(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Body() dto: ChangePasswordDto,
    @ClientIp() ip: string,
  ) {
    return this.service.changePassword(
      user.userId,
      dto.currentPassword,
      dto.newPassword,
      ip,
    );
  }

  @Post("2fa/setup")
  @UseGuards(CompanyJwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  setup2fa(@CurrentCompanyUser() user: AuthenticatedCompanyUser) {
    return this.service.setupTwoFactor(user.userId);
  }

  @Post("2fa/enable")
  @Throttle({ auth: { limit: 5, ttl: 60_000 } })
  @UseGuards(CompanyJwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  enable2fa(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Body() dto: TwoFactorCodeDto,
  ) {
    return this.service.enableTwoFactor(user.userId, dto.code);
  }

  @Post("2fa/disable")
  @Throttle({ auth: { limit: 5, ttl: 60_000 } })
  @UseGuards(CompanyJwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  disable2fa(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Body() dto: TwoFactorCodeDto,
  ) {
    return this.service.disableTwoFactor(user.userId, dto.code);
  }

  // ── E-posta 2FA ── (authenticator uygulaması olmayan kullanıcılar için)
  @Post("2fa/email/send-code")
  @Throttle({ auth: { limit: 5, ttl: 60_000 } })
  @UseGuards(CompanyJwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  send2faEmailCode(@CurrentCompanyUser() user: AuthenticatedCompanyUser) {
    return this.service.sendEmailTwoFactorCode(user.userId);
  }

  @Post("2fa/email/enable")
  @Throttle({ auth: { limit: 5, ttl: 60_000 } })
  @UseGuards(CompanyJwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  enable2faEmail(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Body() dto: TwoFactorCodeDto,
  ) {
    return this.service.enableEmailTwoFactor(user.userId, dto.code);
  }
}
