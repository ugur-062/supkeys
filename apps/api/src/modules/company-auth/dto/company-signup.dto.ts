import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";

/**
 * Birleşik sistem — firma self-servis kaydı. Kaydı yapan kişi firmanın
 * SAHİBİ olur (owner + YONETICI + SATIN_ALMACI + SATISCI). Bedava (STANDARD)
 * başlar; aktiflik/alıcılık paralı upgrade ile açılır.
 */
export class CompanySignupDto {
  @IsString()
  @MinLength(2, { message: "Firma adı en az 2 karakter olmalı" })
  @MaxLength(200, { message: "Firma adı en fazla 200 karakter" })
  companyName!: string;

  @IsString()
  @MinLength(2, { message: "Ad en az 2 karakter olmalı" })
  @MaxLength(80)
  firstName!: string;

  @IsString()
  @MinLength(2, { message: "Soyad en az 2 karakter olmalı" })
  @MaxLength(80)
  lastName!: string;

  @IsEmail({}, { message: "Geçerli bir e-posta adresi giriniz" })
  email!: string;

  @IsString()
  @MinLength(8, { message: "Parola en az 8 karakter olmalı" })
  @MaxLength(72, { message: "Parola en fazla 72 karakter" })
  @Matches(/[a-zA-Z]/, { message: "Parola en az bir harf içermeli" })
  @Matches(/[0-9]/, { message: "Parola en az bir rakam içermeli" })
  password!: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;
}
