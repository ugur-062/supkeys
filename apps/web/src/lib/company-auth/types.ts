// Birleşik sistem — Company auth tipleri (backend /company-auth ile uyumlu).

export type CompanyRole =
  | "YONETICI"
  | "SATIN_ALMACI"
  | "SATISCI"
  | "ONAYLAYICI";

export type CompanyTier = "STANDARD" | "PAKET";

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
  twoFactorEnabled: boolean;
  notificationPrefs: Record<string, boolean> | null;
  lastLoginAt: string | null;
}

export interface CompanyProfile {
  id: string;
  name: string;
  slug: string | null;
  supkeysId: string | null;
  tier: CompanyTier;
  country: string;
  companyVerificationStatus: CompanyVerificationStatus;
  onboardingCompletedAt: string | null;
  ownerUserId: string | null;
  publicEnabled: boolean;
  isActive: boolean;
}

export interface CompanyLoginResponse {
  token: string;
  user: CompanyUserDto;
  company: CompanyProfile;
}

export interface CompanyMeResponse {
  user: CompanyUserDto;
  company: CompanyProfile;
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
}
