import type { Locale } from "@rothern/i18n";
// Birleşik sistem — Company auth tipleri (backend /company-auth ile uyumlu).

export type CompanyRole =
  | "SAHIP"
  | "YONETICI"
  | "SATIN_ALMACI"
  | "SATISCI"
  | "ONAYLAYICI";

/**
 * Erişim kademesi — sıra karşılaştırması @rothern/shared `tierAtLeast`.
 * ÜCRETSİZ DÖNEM (2026-10-07): API bu alanı EFEKTİF değerle doldurur
 * (doğrulanmış firma tam erişim = GOLD; doğrulanmamış STANDART sınırları).
 * Değerler yalnız kapı mantığında kullanılır, kullanıcıya ADIYLA gösterilmez.
 */
export type CompanyTier = "STANDART" | "SILVER" | "GOLD";

export type CompanyVerificationStatus =
  | "UNVERIFIED"
  | "PENDING"
  | "VERIFIED"
  | "REJECTED";

export interface CompanyUserDto {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  roles: CompanyRole[];
  isOwner: boolean;
  /** Efektif izinler (rol + override + sahiplik) — UI kapıları için. */
  permissions?: string[];
  twoFactorEnabled: boolean;
  /**
   * Açık 2FA'nın yöntemi (kapalıyken null). Ayarlar 2FA ekranı metni ve
   * "E-postaya kod gönder" düğmesini buna göre seçer. Eski anlık görüntüde
   * olmayabilir.
   */
  twoFactorMethod?: "AUTHENTICATOR" | "EMAIL" | null;
  notificationPrefs: Record<string, boolean> | null;
  lastLoginAt: string | null;
  /** Arayüz dili (tr/en/ru) — @rothern/i18n LOCALES; eski anlık görüntüde olmayabilir. */
  locale?: Locale;
  /**
   * Sözleşme/KVKK onay izi eksik (admin eliyle açılan hesap) → panel onay
   * kapısı (`TermsAcceptanceGate`). Eski anlık görüntüde olmayabilir.
   */
  needsTermsAcceptance?: boolean;
}

export interface CompanyProfile {
  id: string;
  name: string;
  slug: string | null;
  rothernId: string | null;
  tier: CompanyTier;
  country: string;
  companyVerificationStatus: CompanyVerificationStatus;
  onboardingCompletedAt: string | null;
  ownerUserId: string | null;
  publicEnabled: boolean;
  isActive: boolean;
  website: string | null;
}

export interface CompanyLoginResponse {
  /**
   * Denetim 2026-08-26 Parça 10: token artık YANITTA DÖNMEZ —
   * `AuthCookieInterceptor` httpOnly cookie'ye yazdıktan sonra gövdeden
   * çıkarır. Alan sözleşmede bilerek bırakılmadı; oturum yalnız cookie'dedir
   * ve `/me` ile doğrulanır (CLAUDE.md "token JS'ten OKUNMAZ").
   */
  user: CompanyUserDto;
  company: CompanyProfile;
}

export interface CompanyMeResponse {
  user: CompanyUserDto;
  company: CompanyProfile;
  /** Uyku hâlindeki backend bayrağı (ücretli paketler dönene dek web OKUMAZ);
   *  alan adı API sözleşmesi olarak durur. */
  selfUpgradeEnabled: boolean;
}

export interface CompanySignupInput {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  password: string;
  termsAccepted: boolean;
  mediationAccepted: boolean;
  kvkkAccepted: boolean;
  marketingConsent?: boolean;
  profileImprovementConsent?: boolean;
  /** Davet linkinden gelen referral token'ı (`?ref=`); BK-CONN-1. */
  referralToken?: string;
}
