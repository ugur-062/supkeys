import { IsString, MaxLength, MinLength } from "class-validator";
import { PasswordPolicy } from "../../../common/auth/password-policy";
import { tApi } from "../../../common/i18n/i18n.service";

export class ConfirmPasswordResetDto {
  // Kesik/bozuk bağlantı: ham "En az 40 karakter olmalı" yerine servisteki
  // geçersiz bağlantı metni (arayüz testi D-085) — web bu alan hatasını
  // "geçersiz bağlantı" durumuna eşler.
  @IsString({ message: () => tApi("api.passwordReset.gecersizVeyaKullanilmisBaglanti") })
  @MinLength(40, { message: () => tApi("api.passwordReset.gecersizVeyaKullanilmisBaglanti") })
  @MaxLength(80, { message: () => tApi("api.passwordReset.gecersizVeyaKullanilmisBaglanti") })
  token!: string;

  // Politika kayıt/davet ve ChangePasswordDto ile AYNI — hiçbir yol farklı
  // güçte şifre kabul etmesin (sözleşme: password-policy-parity.spec). Kural
  // TEK kaynakta: `common/auth/password-policy.ts`.
  @PasswordPolicy()
  newPassword!: string;
}
