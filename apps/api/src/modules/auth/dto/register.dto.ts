import { IsEmail, IsString, MinLength, MaxLength, Matches } from "class-validator";

export class RegisterDto {
  @IsEmail({}, { message: "Geçerli bir e-posta adresi giriniz" })
  email!: string;

  @IsString()
  @MinLength(8, { message: "Şifre en az 8 karakter olmalı" })
  @MaxLength(72, { message: "Şifre en fazla 72 karakter olabilir" })
  password!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName!: string;

  // Tenant: hem firma adı hem slug ile yeni firma kaydı
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  companyName!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(50)
  @Matches(/^[a-z0-9-]+$/, {
    message: "Slug sadece küçük harf, rakam ve tire içerebilir",
  })
  companySlug!: string;
}
