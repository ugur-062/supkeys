import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  MinLength,
} from "class-validator";

export class AdminLoginDto {
  @IsEmail({}, { message: "Geçerli bir e-posta adresi giriniz" })
  email!: string;

  @IsString()
  @MinLength(1)
  password!: string;

  // "Beni hatırla" — false ise oturum cookie'si (tarayıcı kapanınca çıkış).
  @IsOptional()
  @IsBoolean()
  rememberMe?: boolean;
}
