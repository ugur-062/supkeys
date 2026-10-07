export type AdminRole = "SUPER_ADMIN" | "SALES" | "SUPPORT";

export interface AuthAdmin {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: AdminRole;
  /**
   * Geçici parolayla (personel ekle / şifre sıfırla) giriş yapıldı, kendi şifresi
   * henüz konmadı (arayüz testi D-025). true iken API yalnız /me + şifre
   * değiştirme uçlarını açar; panel Ayarlar'a kilitlenir.
   */
  mustChangePassword?: boolean;
}

export interface AdminAuthResponse {
  token: string;
  admin: AuthAdmin;
}
