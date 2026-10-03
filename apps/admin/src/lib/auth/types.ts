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
  /**
   * Geçici parolayla (personel ekle / şifre sıfırla) giriş yapıldı, kendi şifresi
   * henüz konmadı (arayüz testi D-025). true iken API yalnız /me + şifre
   * değiştirme + 2FA kurulum uçlarını açar; panel Ayarlar'a kilitlenir.
   */
  mustChangePassword?: boolean;
}

export interface AdminAuthResponse {
  token: string;
  admin: AuthAdmin;
}
