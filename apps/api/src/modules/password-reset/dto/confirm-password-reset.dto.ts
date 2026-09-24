import { IsString, Matches, MaxLength, MinLength } from "class-validator";
import { tApi } from "../../../common/i18n/i18n.service";

export class ConfirmPasswordResetDto {
  @IsString()
  @MinLength(40)
  @MaxLength(80)
  token!: string;

  // Politika ChangePasswordDto ile AYNI — iki yol farklı güçte parola
  // kabul etmesin.
  @IsString()
  @MinLength(8, { message: () => tApi("api.dto.confirmPasswordReset.parolaEnAz8KarakterOlmali") })
  @MaxLength(72)
  @Matches(/[a-z]/, { message: () => tApi("api.dto.confirmPasswordReset.parolaEnAzBirKucukHarfIcermeli") })
  @Matches(/[A-Z]/, { message: () => tApi("api.dto.confirmPasswordReset.parolaEnAzBirBuyukHarfIcermeli") })
  @Matches(/\d/, { message: () => tApi("api.dto.confirmPasswordReset.parolaEnAzBirRakamIcermeli") })
  newPassword!: string;
}
