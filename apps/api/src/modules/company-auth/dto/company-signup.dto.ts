import {
  Equals,
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from "class-validator";
import { PasswordPolicy } from "../../../common/auth/password-policy";
import { tApi } from "../../../common/i18n/i18n.service";
import { IsIntlPhone, NormalizePhone } from "./phone.validator";

/**
 * Birleşik sistem — firma self-servis kaydı. Kaydı yapan kişi firmanın SAHİBİ
 * olur (owner + YONETICI). Bedava (STANDARD) başlar; e-posta doğrulaması +
 * onboarding + belge/2FA ile premium (ihale açma) açılır.
 *
 * Firma ünvanı signup'ta SORULMAZ — onboarding Adım 1'de alınır (firma geçici
 * adla açılır). Signup: kişi bilgisi + zorunlu sözleşmeler.
 */
export class CompanySignupDto {
  @IsString()
  // Tek harfli ad meşru (Çin, Kore, Vietnam …): yalnız boş olamaz.
  @Matches(/\S/, { message: () => tApi("api.dto.companySignup.adBosOlamaz") })
  @MaxLength(80)
  firstName!: string;

  @IsString()
  @Matches(/\S/, { message: () => tApi("api.dto.companySignup.soyadBosOlamaz") })
  @MaxLength(80)
  lastName!: string;

  @IsEmail({}, { message: () => tApi("api.dto.companySignup.gecerliBirEPostaAdresiGiriniz") })
  email!: string;

  // TELEFON İSTEĞE BAĞLI (sahip kararı 2026-10-08): kayıt formu artık sormaz
  // (numara doğrulanmıyordu, başka firmaya gösterilmiyordu). Alan yoksa / null
  // / boşsa `CompanyUser.phone` null yazılır. Eski web paketi göndermeyi
  // sürdürebilir: gelen numara eskisi gibi doğrulanır ve saklanır —
  // "+<ülke kodu> <numara>", uzunluk ülkeye göre, tek kaynak
  // `isValidPhoneNumber` (bkz. phone.validator.ts). DAĞITIM SIRASI: API
  // web'den ÖNCE — eski API telefonsuz gövdeyi 400 ile reddeder.
  @IsOptional()
  @NormalizePhone()
  @IsString()
  @MaxLength(30)
  @IsIntlPhone(
    { allowEmpty: true },
    { message: () => tApi("api.dto.companySignup.gecerliBirTelefonGiriniz") },
  )
  phone?: string | null;

  // En az 10 karakter, en çok 72 UTF-8 bayt; küçük + büyük harf + rakam + özel karakter — kural TEK
  // kaynakta (`common/auth/password-policy.ts`).
  @PasswordPolicy()
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

  // Giriş ekranından doğrulama: "Oturumumu açık bırak" tercihi. false ise
  // AuthCookieInterceptor oturum çerezi basar; verilmezse (kayıt akışı)
  // varsayılan kalıcı (derin denetim MU-23).
  @IsOptional()
  @IsBoolean()
  rememberMe?: boolean;
}

/** Doğrulama kodunu yeniden gönder. */
export class ResendEmailCodeDto {
  @IsEmail({}, { message: () => tApi("api.dto.companySignup.gecerliBirEPostaAdresiGiriniz") })
  email!: string;
}

/**
 * Doğrulanmamış kayıtta e-postayı düzelt ("E-posta adresini değiştir").
 * Kimlik = mevcut adres + kayıtta belirlenen parola (kayıt adımında token yok).
 */
export class ChangeSignupEmailDto {
  @IsEmail({}, { message: () => tApi("api.dto.companySignup.gecerliBirEPostaAdresiGiriniz") })
  email!: string;

  @IsString()
  @MaxLength(72)
  password!: string;

  @IsEmail({}, { message: () => tApi("api.dto.companySignup.gecerliBirEPostaAdresiGiriniz") })
  newEmail!: string;
}
