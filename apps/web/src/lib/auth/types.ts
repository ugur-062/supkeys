export type UserRole = "COMPANY_ADMIN" | "BUYER" | "APPROVER";

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
  };
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
}
