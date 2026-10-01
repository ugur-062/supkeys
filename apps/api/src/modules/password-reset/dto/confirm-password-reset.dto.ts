import { IsString, Matches, MaxLength, MinLength } from "class-validator";
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
  // güçte şifre kabul etmesin (sözleşme: password-policy-parity.spec).
  @IsString()
  @MinLength(10, { message: () => tApi("api.dto.companySignup.parolaEnAz10KarakterOlmali") })
  @MaxLength(72)
  @Matches(/[a-z]/, { message: () => tApi("api.dto.confirmPasswordReset.parolaEnAzBirKucukHarfIcermeli") })
  @Matches(/[A-Z]/, { message: () => tApi("api.dto.confirmPasswordReset.parolaEnAzBirBuyukHarfIcermeli") })
  @Matches(/\d/, { message: () => tApi("api.dto.confirmPasswordReset.parolaEnAzBirRakamIcermeli") })
  @Matches(/[^a-zA-Z0-9]/, { message: () => tApi("api.dto.companySignup.parolaEnAzBirOzelKarakterIcermeli") })
  newPassword!: string;
}
