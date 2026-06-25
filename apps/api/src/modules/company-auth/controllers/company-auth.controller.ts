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
  CurrentCompanyUser,
  type AuthenticatedCompanyUser,
} from "../decorators/current-company-user.decorator";
import { CompanyLoginDto } from "../dto/company-login.dto";
import { CompanySignupDto } from "../dto/company-signup.dto";
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
}
