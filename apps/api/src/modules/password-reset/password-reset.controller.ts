import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { CheckPasswordResetDto } from "./dto/check-password-reset.dto";
import { ConfirmPasswordResetDto } from "./dto/confirm-password-reset.dto";
import { PasswordResetService } from "./password-reset.service";

/**
 * Public parola sıfırlama uçları. Kullanıcı e-postadaki linke tıklar →
 * /reset-password sayfası açılırken `check` (salt okuma), form gönderilince
 * `confirm`.
 *
 * Yeni bir uç eklenirse `common/auth/csrf.guard.ts` `PRE_SESSION_PUBLIC_PATHS`
 * listesine de girer: bu uçlar oturum çerezi okumaz, bayat çerezli tarayıcıda
 * CSRF 403'üyle düşmemelidir. Her ucun TEK adresi vardır (`auth/password-reset/…`).
 */
@Controller()
export class PasswordResetController {
  constructor(private readonly service: PasswordResetService) {}

  @Post("auth/password-reset/confirm")
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  confirm(@Body() dto: ConfirmPasswordResetDto): Promise<unknown> {
    return this.service.confirmPasswordReset(dto.token, dto.newPassword);
  }

  /**
   * Bağlantı hâlâ kullanılabilir mi (arayüz testi 2026-10 login-16) —
   * `{ valid: boolean }`; geçersizse confirm'ün vereceği metin `message`ta.
   * Salt okuma: token tüketilmez. Sınır confirm ile aynı (IP başına 5/dk).
   *
   * TEK ADRES: `auth/password-reset/check`, confirm'ün yanında (web bunu
   * çağırır). İlk sürümdeki ikinci adres (`password-reset/check`) kaldırıldı:
   * çağıranı yoktu ve CSRF muafiyet listesinde fazladan bir yol tutuyordu.
   */
  @Post("auth/password-reset/check")
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  check(@Body() dto: CheckPasswordResetDto): Promise<{ valid: boolean; message?: string }> {
    return this.service.checkResetToken(dto.token);
  }
}
