import {
  Equals,
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";

/**
 * Birleşik sistem — firma self-servis kaydı. Kaydı yapan kişi firmanın SAHİBİ
 * olur (owner + YONETICI). Bedava (STANDARD) başlar; e-posta doğrulaması +
 * onboarding + belge/2FA ile premium (ihale açma) açılır.
 *
 * Firma ünvanı signup'ta SORULMAZ — onboarding Adım 1'de alınır (firma geçici
 * adla açılır). Signup: kişi bilgisi + telefon + zorunlu sözleşmeler.
 */
export class CompanySignupDto {
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

  // +90 5XX XXX XX XX (maske frontend'de). Rakam/boşluk/+/() kabul.
  @IsString()
  @Matches(/^[0-9+\s()]{10,20}$/, { message: "Geçerli bir telefon giriniz" })
  phone!: string;

  // En az 10 karakter; büyük + küçük + rakam + özel karakter.
  @IsString()
  @MinLength(10, { message: "Parola en az 10 karakter olmalı" })
  @MaxLength(72, { message: "Parola en fazla 72 karakter" })
  @Matches(/[a-z]/, { message: "Parola en az bir küçük harf içermeli" })
  @Matches(/[A-Z]/, { message: "Parola en az bir büyük harf içermeli" })
  @Matches(/[0-9]/, { message: "Parola en az bir rakam içermeli" })
  @Matches(/[^a-zA-Z0-9]/, { message: "Parola en az bir özel karakter içermeli" })
  password!: string;

  // Zorunlu sözleşmeler — kabul edilmeden kayıt tamamlanamaz.
  @IsBoolean()
  @Equals(true, { message: "Kullanıcı sözleşmesini kabul etmelisiniz" })
  termsAccepted!: boolean;

  @IsBoolean()
  @Equals(true, { message: "Aracılık ve kullanım sözleşmesini kabul etmelisiniz" })
  mediationAccepted!: boolean;

  @IsBoolean()
  @Equals(true, { message: "KVKK aydınlatma metnini onaylamalısınız" })
  kvkkAccepted!: boolean;

  // Opsiyonel açık rızalar (varsayılan kapalı).
  @IsOptional()
  @IsBoolean()
  marketingConsent?: boolean;

  @IsOptional()
  @IsBoolean()
  profileImprovementConsent?: boolean;
}

/** E-posta doğrulama — 6 haneli kod. */
export class VerifyEmailDto {
  @IsEmail({}, { message: "Geçerli bir e-posta adresi giriniz" })
  email!: string;

  @IsString()
  @Matches(/^[0-9]{6}$/, { message: "6 haneli kod giriniz" })
  code!: string;
}

/** Doğrulama kodunu yeniden gönder. */
export class ResendEmailCodeDto {
  @IsEmail({}, { message: "Geçerli bir e-posta adresi giriniz" })
  email!: string;
}
