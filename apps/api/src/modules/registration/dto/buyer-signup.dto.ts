import {
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";
import { PASSWORD_REGEX } from "../helpers/token.helper";

/**
 * Madde 29 — alıcı signup (admin davet linki ile). E-posta davetten gelir
 * (form'da kilitli); kullanıcı ad/soyad/şifre belirler.
 */
export class BuyerSignupDto {
  @IsString()
  invitationToken!: string;

  @IsString()
  @Length(2, 100)
  firstName!: string;

  @IsString()
  @Length(2, 100)
  lastName!: string;

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
}

export class VerifyBuyerEmailDto {
  @IsString()
  challengeId!: string;

  @IsString()
  @Length(6, 6, { message: "Doğrulama kodu 6 haneli olmalıdır" })
  code!: string;
}
