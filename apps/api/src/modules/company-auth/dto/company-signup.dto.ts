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
import { tApi } from "../../../common/i18n/i18n.service";

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
  @MinLength(2, { message: () => tApi("api.dto.companySignup.adEnAz2KarakterOlmali") })
  @MaxLength(80)
  firstName!: string;

  @IsString()
  @MinLength(2, { message: () => tApi("api.dto.companySignup.soyadEnAz2KarakterOlmali") })
  @MaxLength(80)
  lastName!: string;

  @IsEmail({}, { message: () => tApi("api.dto.companySignup.gecerliBirEPostaAdresiGiriniz") })
  email!: string;

  // +90 5XX XXX XX XX (maske frontend'de). Rakam/boşluk/+/() kabul.
  @IsString()
  @Matches(/^[0-9+\s()]{10,20}$/, { message: () => tApi("api.dto.companySignup.gecerliBirTelefonGiriniz") })
  phone!: string;

  // En az 10 karakter; büyük + küçük + rakam + özel karakter.
  @IsString()
  @MinLength(10, { message: () => tApi("api.dto.companySignup.parolaEnAz10KarakterOlmali") })
  @MaxLength(72, { message: () => tApi("api.dto.companySignup.parolaEnFazla72Karakter") })
  @Matches(/[a-z]/, { message: () => tApi("api.dto.companySignup.parolaEnAzBirKucukHarfIcermeli") })
  @Matches(/[A-Z]/, { message: () => tApi("api.dto.companySignup.parolaEnAzBirBuyukHarfIcermeli") })
  @Matches(/[0-9]/, { message: () => tApi("api.dto.companySignup.parolaEnAzBirRakamIcermeli") })
  @Matches(/[^a-zA-Z0-9]/, { message: () => tApi("api.dto.companySignup.parolaEnAzBirOzelKarakterIcermeli") })
  password!: string;

  // Zorunlu sözleşmeler — kabul edilmeden kayıt tamamlanamaz.
  @IsBoolean()
  @Equals(true, { message: () => tApi("api.dto.companySignup.kullaniciSozlesmesiniKabulEtmelisiniz") })
  termsAccepted!: boolean;

  @IsBoolean()
  @Equals(true, { message: () => tApi("api.dto.companySignup.aracilikVeKullanimSozlesmesiniKabulEtmelisiniz") })
  mediationAccepted!: boolean;

  @IsBoolean()
  @Equals(true, { message: () => tApi("api.dto.companySignup.kvkkAydinlatmaMetniniOnaylamalisiniz") })
  kvkkAccepted!: boolean;

  // Opsiyonel açık rızalar (varsayılan kapalı).
  @IsOptional()
  @IsBoolean()
  marketingConsent?: boolean;

  @IsOptional()
  @IsBoolean()
  profileImprovementConsent?: boolean;

  /**
   * Davet linkinden gelen referral token'ı (`/company/kayit?ref=<token>`).
   * BK-CONN-1: yalnız BU token'ın referral'ı ACTIVE bağlantı olur; aynı e-postayı
   * davet eden diğer firmalar PENDING istek olarak kalır (rıza yalnız tıklanan
   * davet için verildi).
   */
  @IsOptional()
  @IsString()
  referralToken?: string;
}

/** E-posta doğrulama — 6 haneli kod. */
export class VerifyEmailDto {
  @IsEmail({}, { message: () => tApi("api.dto.companySignup.gecerliBirEPostaAdresiGiriniz") })
  email!: string;

  @IsString()
  @Matches(/^[0-9]{6}$/, { message: () => tApi("api.dto.companySignup.altiHaneliKodGiriniz") })
  code!: string;
}

/** Doğrulama kodunu yeniden gönder. */
export class ResendEmailCodeDto {
  @IsEmail({}, { message: () => tApi("api.dto.companySignup.gecerliBirEPostaAdresiGiriniz") })
  email!: string;
}
