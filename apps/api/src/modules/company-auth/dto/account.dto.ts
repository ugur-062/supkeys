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

export class UpdateMeDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  lastName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  /** Arayüz dili — desteklenen kodlar @rothern/i18n LOCALES (tr/en/ru). */
  @IsOptional()
  @IsIn(LOCALES)
  locale?: string;
}

export class ChangePasswordDto {
  @IsString()
  currentPassword!: string;

  @IsString()
  @MinLength(8, { message: () => tApi("api.dto.account.parolaEnAz8Karakter") })
  @MaxLength(72)
  @Matches(/[A-Z]/, { message: () => tApi("api.dto.account.enAzBirBuyukHarfAZ") })
  @Matches(/[a-z]/, { message: () => tApi("api.dto.account.enAzBirKucukHarfAz") })
  @Matches(/[0-9]/, { message: () => tApi("api.dto.account.enAzBirRakam") })
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
