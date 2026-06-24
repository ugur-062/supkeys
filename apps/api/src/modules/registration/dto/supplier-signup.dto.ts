import {
  IsEmail,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";
import { PASSWORD_REGEX } from "../helpers/token.helper";

/** Madde 29 — tedarikçi signup (önce hesap; şirket bilgisi onboarding'de). */
export class SupplierSignupDto {
  @IsString()
  @Length(2, 100)
  firstName!: string;

  @IsString()
  @Length(2, 100)
  lastName!: string;

  @IsEmail({}, { message: "Geçerli bir kurumsal e-posta giriniz" })
  @MaxLength(200)
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsString()
  @MinLength(8, { message: "Şifre en az 8 karakter olmalı" })
  @MaxLength(72)
  @Matches(PASSWORD_REGEX, {
    message: "Şifre en az 1 büyük harf, 1 küçük harf ve 1 rakam içermeli",
  })
  password!: string;

  // Madde 29 — alıcı davet linki (?invitation=) ile gelindiyse: signup'ta
  // otomatik ACTIVE bağlantı kurulur.
  @IsOptional()
  @IsString()
  @MaxLength(200)
  invitationToken?: string;

  // "Tedarikçi Ol" — alıcı public profilinden (?connect=slug) gelindiyse:
  // PENDING_TENANT_APPROVAL bağlantı kurulur (alıcı onayı bekler).
  @IsOptional()
  @IsString()
  @MaxLength(200)
  connectSlug?: string;
}

export class VerifySupplierEmailDto {
  @IsString()
  challengeId!: string;

  @IsString()
  @Length(6, 6, { message: "Doğrulama kodu 6 haneli olmalıdır" })
  code!: string;
}
