import { IsString, Matches, MaxLength, MinLength } from "class-validator";
import { tApi } from "../../../common/i18n/i18n.service";

export class ConfirmPasswordResetDto {
  @IsString()
  @MinLength(40)
  @MaxLength(80)
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
