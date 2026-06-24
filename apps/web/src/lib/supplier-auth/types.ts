export type CompanyType = "JOINT_STOCK" | "LIMITED" | "SOLE_PROPRIETOR";
export type SupplierMembership = "STANDARD" | "PREMIUM";
export type SupplierRelationStatus =
  | "ACTIVE"
  | "PENDING_TENANT_APPROVAL"
  | "BLOCKED";

export interface SupplierUserDto {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  /** G6 madde 20 — yönetici mi (banka + kullanıcı yönetimi yetkisi). */
  isManager?: boolean;
  /** Madde 29 — e-posta 2FA aktif mi. */
  twoFactorEnabled?: boolean;
  lastLoginAt: string | null;
}

export interface SupplierProfile {
  id: string;
  /** Faz 3 madde 6 — kalıcı Supkeys ID (K7X9-3M2P); alıcılar bununla ekler. */
  supkeysId: string | null;
  companyName: string;
  companyType: CompanyType;
  taxNumber: string | null;
  taxOffice: string | null;
  industry: string | null;
  website: string | null;
  country: string;
  city: string;
  district: string | null;
  stateRegion: string | null;
  addressLine: string;
  postalCode: string | null;
  membership: SupplierMembership;
  isActive: boolean;
  isBlocked: boolean;
  // Madde 29 — FAZ 2 alanları (onboarding prefill).
  legalName: string | null;
  neighborhood: string | null;
  billingTitle: string | null;
  billingEmail: string | null;
  authorizedTckn: string | null;
  authorizedTitle: string | null;
  // FAZ 2 — UNSPSC kategoriler: ana (segment, ≤3) + alt (sınırsız).
  sectors: string[];
  sectorCategoryIds: string[];
  subCategoryIds: string[];
  // Madde 29 — FAZ 3 kurumsal kimlik (panel-içi editlenebilir).
  mersisNo: string | null;
  tradeRegistryNo: string | null;
  kepAddress: string | null;
  iban: string | null;
  ibanHolder: string | null;
  billingPhone: string | null;
  billingPhoneVerifiedAt: string | null;
  // Madde 29 — onboarding/doğrulama durumu.
  onboardingCompletedAt: string | null;
  companyVerificationStatus:
    | "UNVERIFIED"
    | "PENDING"
    | "VERIFIED"
    | "REJECTED";
}

export interface SupplierTenantRelation {
  id: string;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  status: SupplierRelationStatus;
  blockedAt: string | null;
  blockedReason: string | null;
  createdAt: string;
}

export interface SupplierLoginResponse {
  token: string;
  supplierUser: SupplierUserDto;
  supplier: SupplierProfile;
}

/** Madde 29 — 2FA açık kullanıcıda login OTP challenge döner. */
export interface TwoFactorChallengeResponse {
  twoFactorRequired: true;
  challengeId: string;
  expiresAt: string;
}

export type SupplierLoginResult =
  | SupplierLoginResponse
  | TwoFactorChallengeResponse;

export function isTwoFactorChallenge(
  r: SupplierLoginResult,
): r is TwoFactorChallengeResponse {
  return "twoFactorRequired" in r && r.twoFactorRequired === true;
}

export interface SupplierMeResponse {
  supplierUser: SupplierUserDto;
  supplier: SupplierProfile;
  tenantRelations: SupplierTenantRelation[];
}
