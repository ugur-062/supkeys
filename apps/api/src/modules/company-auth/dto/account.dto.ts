import {
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";

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
}

export class ChangePasswordDto {
  @IsString()
  currentPassword!: string;

  @IsString()
  @MinLength(8, { message: "Parola en az 8 karakter" })
  @MaxLength(72)
  @Matches(/[A-Z]/, { message: "En az bir büyük harf (A-Z)" })
  @Matches(/[a-z]/, { message: "En az bir küçük harf (a-z)" })
  @Matches(/[0-9]/, { message: "En az bir rakam" })
  newPassword!: string;
}

export class UpdateNotificationPrefsDto {
  @IsObject()
  prefs!: Record<string, boolean>;
}

export class TwoFactorCodeDto {
  @IsString()
  @MinLength(6, { message: "6 haneli kod girin" })
  @MaxLength(10)
  code!: string;
}
