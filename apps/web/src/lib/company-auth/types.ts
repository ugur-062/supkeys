// Birleşik sistem — Company auth tipleri (backend /company-auth ile uyumlu).

export type CompanyRole =
  | "SAHIP"
  | "YONETICI"
  | "SATIN_ALMACI"
  | "SATISCI"
  | "ONAYLAYICI";

/** Faz T: 4 kademe — STANDART paketsiz-pasif; sıra karşılaştırması @rothern/shared tierAtLeast. */
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
  notificationPrefs: Record<string, boolean> | null;
  lastLoginAt: string | null;
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
  /** Y2: self-servis premium yükseltme açık mı (backend flag — tek kaynak).
   *  false ise "Premium'a Geç" CTA'sı gizlenir; premium manuel admin grant. */
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
