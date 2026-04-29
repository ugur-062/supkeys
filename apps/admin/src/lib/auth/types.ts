export type AdminRole = "SUPER_ADMIN" | "SALES" | "SUPPORT";

export interface AuthAdmin {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: AdminRole;
}

export interface AdminAuthResponse {
  token: string;
  admin: AuthAdmin;
}
