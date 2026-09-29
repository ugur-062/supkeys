import { LOCALES } from "@rothern/i18n";
import {
  Equals,
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from "class-validator";

import { tApi } from "../../../common/i18n/i18n.service";
import { IsIntlPhone, NormalizePhone } from "./phone.validator";

export class UpdateMeDto {
  // @IsOptional null'ı da geçirirdi → serviste null.trim() 500 (derin denetim
  // LU-06). Ad/soyad silinemez: yalnız ALAN YOKSA atlanır, null 400 alır.
  @ValidateIf((_o, v) => v !== undefined)
  @IsString()
  @Matches(/\S/) // tek harfli ad meşru; yalnız boş olamaz
  @MaxLength(80)
  firstName?: string;

  @ValidateIf((_o, v) => v !== undefined)
  @IsString()
  @Matches(/\S/)
  @MaxLength(80)
  lastName?: string;

  // Boş dize (ya da null) numarayı siler; dolu değer ülke uzunluğuna göre (phone.validator.ts).
  @IsOptional()
  @NormalizePhone()
  @IsString()
  @MaxLength(30)
  @IsIntlPhone(
    { allowEmpty: true },
    { message: () => tApi("api.dto.companySignup.gecerliBirTelefonGiriniz") },
  )
  phone?: string | null;

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

/**
 * Sözleşme onayı — onay izi olmayan hesabın (admin eliyle açılan üye) ilk
 * girişte kendisinin verdiği onay (derin denetim 2026-09-29 MU-04). Kayıt ve
 * davet kabulündeki üç zorunlu onayın aynısı.
 */
export class AcceptTermsDto {
  @IsBoolean()
  @Equals(true, { message: () => tApi("api.dto.companyUser.kullaniciSozlesmesiniKabulEtmelisiniz") })
  termsAccepted!: boolean;

  @IsBoolean()
  @Equals(true, { message: () => tApi("api.dto.companyUser.aracilikVeKullanimSozlesmesiniKabulEtmelisiniz") })
  mediationAccepted!: boolean;

  @IsBoolean()
  @Equals(true, { message: () => tApi("api.dto.companyUser.kvkkAydinlatmaMetniniOnaylamalisiniz") })
  kvkkAccepted!: boolean;

  @IsOptional()
  @IsBoolean()
  marketingConsent?: boolean;

  @IsOptional()
  @IsBoolean()
  profileImprovementConsent?: boolean;
}
