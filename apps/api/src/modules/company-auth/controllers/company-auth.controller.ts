import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Ip,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import {
  CurrentCompanyUser,
  type AuthenticatedCompanyUser,
} from "../decorators/current-company-user.decorator";
import {
  ChangePasswordDto,
  TwoFactorCodeDto,
  UpdateMeDto,
  UpdateNotificationPrefsDto,
} from "../dto/account.dto";
import { CompanyLoginDto } from "../dto/company-login.dto";
import {
  CompanySignupDto,
  ResendEmailCodeDto,
  VerifyEmailDto,
} from "../dto/company-signup.dto";
import { CompleteOnboardingDto, ViesCheckDto } from "../dto/onboarding.dto";
import { CompanyJwtAuthGuard } from "../guards/company-jwt-auth.guard";
import { CompanyAuthService } from "../services/company-auth.service";
import { PasswordResetService } from "../../password-reset/password-reset.service";
import { CompanyForgotPasswordDto } from "../dto/company-forgot-password.dto";

@Controller("company-auth")
export class CompanyAuthController {
  constructor(
    private readonly service: CompanyAuthService,
    private readonly passwordReset: PasswordResetService,
  ) {}

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
    @Ip() ip: string,
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

  @Post("login")
  @Throttle({ auth: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  login(
    @Body() dto: CompanyLoginDto,
    @Ip() ip: string,
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

  @Post("vies-check")
  @UseGuards(CompanyJwtAuthGuard)
  @Throttle({ auth: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  viesCheck(@Body() dto: ViesCheckDto) {
    return this.service.viesCheck(dto.countryCode, dto.vatNumber);
  }

  @Patch("me")
  @UseGuards(CompanyJwtAuthGuard)
  updateMe(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Body() dto: UpdateMeDto,
  ) {
    return this.service.updateMe(user.userId, dto);
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
  ) {
    return this.service.changePassword(
      user.userId,
      dto.currentPassword,
      dto.newPassword,
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
}
