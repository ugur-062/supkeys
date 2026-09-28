import { LOCALES } from "@rothern/i18n";
import {
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";

import { tApi } from "../../../common/i18n/i18n.service";
import { IsIntlPhone, NormalizePhone } from "./phone.validator";

export class UpdateMeDto {
  @IsOptional()
  @IsString()
  @Matches(/\S/) // tek harfli ad meşru; yalnız boş olamaz
  @MaxLength(80)
  firstName?: string;

  @IsOptional()
  @IsString()
  @Matches(/\S/)
  @MaxLength(80)
  lastName?: string;

  // Boş dize numarayı siler; dolu değer ülke uzunluğuna göre (phone.validator.ts).
  @IsOptional()
  @NormalizePhone()
  @IsString()
  @MaxLength(30)
  @IsIntlPhone(
    { allowEmpty: true },
    { message: () => tApi("api.dto.companySignup.gecerliBirTelefonGiriniz") },
  )
  phone?: string;

  /** Arayüz dili — desteklenen kodlar @rothern/i18n LOCALES (tr/en/ru). */
  @IsOptional()
  @IsIn(LOCALES)
  locale?: string;
}

export class ChangePasswordDto {
  @IsString()
  currentPassword!: string;

  // Politika kayıt/davet DTO'suyla AYNI (yayın denetimi 2026-09-28 Bölüm 9):
  // değiştirme ve sıfırlama 8 karakter + özel karaktersiz kabul ediyordu —
  // kayıtta konan kural sıfırlamayla zayıflatılabiliyordu.
  @IsString()
  @MinLength(10, { message: () => tApi("api.dto.companySignup.parolaEnAz10KarakterOlmali") })
  @MaxLength(72)
  @Matches(/[A-Z]/, { message: () => tApi("api.dto.account.enAzBirBuyukHarfAZ") })
  @Matches(/[a-z]/, { message: () => tApi("api.dto.account.enAzBirKucukHarfAz") })
  @Matches(/[0-9]/, { message: () => tApi("api.dto.account.enAzBirRakam") })
  @Matches(/[^a-zA-Z0-9]/, { message: () => tApi("api.dto.companySignup.parolaEnAzBirOzelKarakterIcermeli") })
  newPassword!: string;
}

export class UpdateNotificationPrefsDto {
  @IsObject()
  prefs!: Record<string, boolean>;
}

export class TwoFactorCodeDto {
  @IsString()
  @MinLength(6, { message: () => tApi("api.dto.account.altiHaneliKodGirin") })
  @MaxLength(10)
  code!: string;
}
