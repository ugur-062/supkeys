export type UserRole = "COMPANY_ADMIN" | "BUYER" | "APPROVER";

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  tenant: {
    id: string;
    name: string;
    slug: string;
  };
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
}
