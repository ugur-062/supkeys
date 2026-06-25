import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { ConfirmPasswordResetDto } from "./dto/confirm-password-reset.dto";
import { PasswordResetService } from "./password-reset.service";

/**
 * Public parola sıfırlama confirm endpoint'i. Kullanıcı e-postadaki linke
 * tıklar → /reset-password sayfası → bu endpoint'e POST.
 */
@Controller("auth/password-reset")
export class PasswordResetController {
  constructor(private readonly service: PasswordResetService) {}

  @Post("confirm")
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  confirm(@Body() dto: ConfirmPasswordResetDto): Promise<unknown> {
    return this.service.confirmPasswordReset(dto.token, dto.newPassword);
  }
}
