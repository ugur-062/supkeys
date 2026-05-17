import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { ConfirmPasswordResetDto } from "../dto/confirm-password-reset.dto";
import { AdminTenantUsersService } from "../services/admin-tenant-users.service";

/**
 * V2-6.5 — Public parola sıfırlama confirm endpoint'i. Kullanıcı e-postaya
 * gelen linke tıklar → /reset-password sayfası → bu endpoint'e POST.
 */
@Controller("auth/password-reset")
export class PasswordResetPublicController {
  constructor(private readonly users: AdminTenantUsersService) {}

  @Post("confirm")
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  confirm(@Body() dto: ConfirmPasswordResetDto): Promise<unknown> {
    return this.users.confirmPasswordReset(dto.token, dto.newPassword);
  }
}
