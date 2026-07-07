import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  MinLength,
} from "class-validator";

export class CompanyLoginDto {
  @IsEmail({}, { message: "Geçerli bir e-posta adresi giriniz" })
  email!: string;

  @IsString()
  @MinLength(1)
  password!: string;

  // 2FA açık hesaplarda zorunlu — authenticator kodu.
  @IsOptional()
  @IsString()
  code?: string;

  // "Beni hatırla" — false ise oturum cookie'si (tarayıcı kapanınca çıkış).
  // Varsayılan (undefined) kalıcı (30 gün).
  @IsOptional()
  @IsBoolean()
  rememberMe?: boolean;
}
