export type AdminRole = "SUPER_ADMIN" | "SALES" | "SUPPORT";

export interface AuthAdmin {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: AdminRole;
  twoFactorEnabled?: boolean;
  /**
   * Rol 2FA zorunlu (API `ADMIN_2FA_REQUIRED_ROLES`) ve 2FA henüz kurulmamış.
   * true iken API yalnız /me + 2FA kurulum uçlarını açar; panel Ayarlar'a kilitlenir.
   */
  twoFactorSetupRequired?: boolean;
}

export interface AdminAuthResponse {
  token: string;
  admin: AuthAdmin;
}
