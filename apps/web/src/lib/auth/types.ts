export type UserRole = "COMPANY_ADMIN" | "BUYER" | "APPROVER";
export type CompanyType = "JOINT_STOCK" | "LIMITED" | "SOLE_PROPRIETOR";

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  /** V2-6.5 — RBAC efektif permission listesi (role default + override). */
  permissions: string[];
  tenant: {
    id: string;
    name: string;
    slug: string;
    /** V2-6.5 — Üyelik bitiş tarihi (ISO 8601). null = sınırsız. */
    membershipEndAt: string | null;
    // Madde 29 — FAZ 2 prefill + onboarding/doğrulama durumu
    companyType: CompanyType | null;
    legalName: string | null;
    taxNumber: string | null;
    taxOffice: string | null;
    industry: string | null;
    city: string | null;
    district: string | null;
    neighborhood: string | null;
    postalCode: string | null;
    addressLine: string | null;
    billingTitle: string | null;
    billingEmail: string | null;
    authorizedTckn: string | null;
    authorizedTitle: string | null;
    mersisNo: string | null;
    tradeRegistryNo: string | null;
    kepAddress: string | null;
    iban: string | null;
    ibanHolder: string | null;
    billingPhone: string | null;
    billingPhoneVerifiedAt: string | null;
    sectorCategoryIds: string[];
    onboardingCompletedAt: string | null;
    companyVerificationStatus:
      | "UNVERIFIED"
      | "PENDING"
      | "VERIFIED"
      | "REJECTED";
  };
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
}
