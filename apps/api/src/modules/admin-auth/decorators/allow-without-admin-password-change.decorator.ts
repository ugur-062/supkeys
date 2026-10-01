import { SetMetadata } from "@nestjs/common";

export const ADMIN_ALLOW_WITHOUT_PASSWORD_CHANGE_KEY =
  "admin_allow_without_password_change";

/** 403 kodu — panel bunu gorunce Ayarlar > Sifre Degistir'e kilitlenir. */
export const ADMIN_PASSWORD_CHANGE_REQUIRED_CODE = "ADMIN_PASSWORD_CHANGE_REQUIRED";

/**
 * Gecici parolayla (personel ekle / sifre sifirla) giris yapmis, henuz kendi
 * sifresini koymamis admin'in (`PlatformAdmin.mustChangePassword`) de
 * erisebildigi uc (arayuz testi D-025). AdminRolesGuard bu isaret YOKSA boyle
 * bir admin'i 403 `ADMIN_PASSWORD_CHANGE_REQUIRED` ile reddeder. Yalniz me +
 * change-password + 2FA kurulum (setup/enable) isaretlenir: 2FA zorunlu roldeki
 * yeni personel once 2FA'yi kurar (change-password 2FA kapisindan muaf degil),
 * sonra sifresini degistirir. Baska uca EKLEME.
 */
export const AllowWithoutAdminPasswordChange = () =>
  SetMetadata(ADMIN_ALLOW_WITHOUT_PASSWORD_CHANGE_KEY, true);
