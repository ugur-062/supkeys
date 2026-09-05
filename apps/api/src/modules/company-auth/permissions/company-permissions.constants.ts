import type { CompanyRole } from "@rothern/db";
import {
  ALL_COMPANY_PERMISSIONS,
  ALL_KNOWN_PERMISSIONS,
  COMPANY_PERMISSION_CATALOG,
  COMPANY_ROLE_PRESETS,
  OWNER_ONLY_PERMISSIONS,
  effectivePermissions,
  hasCompanyPermission as sharedHasCompanyPermission,
  normalizePermissions,
  permissionsForRoles,
  rolesFromPermissions,
} from "@rothern/shared";

/**
 * Birleşik sistem — izin modeli. TEK KAYNAK `@rothern/shared`
 * `constants/company-permissions.ts` (katalog, hazır setler, türetme,
 * normalizasyon); bu dosya API'nin ince yüzeyidir.
 *
 * 2026-09-05 (yetki tablosu, Faz 1): doğruluk kaynağı kişinin AÇIK izin
 * listesi (`CompanyUser.permissions`); roller ETİKET (girişte hazır set,
 * çıkışta listeden türetilir). `permissionsOverride` kolonu artık OKUNMAZ
 * (backfill'de listeye katıldı; Faz 4'te düşer).
 */
export {
  ALL_COMPANY_PERMISSIONS,
  ALL_KNOWN_PERMISSIONS,
  COMPANY_PERMISSION_CATALOG,
  COMPANY_ROLE_PRESETS,
  OWNER_ONLY_PERMISSIONS,
  effectivePermissions,
  normalizePermissions,
  permissionsForRoles,
  rolesFromPermissions,
};

/** Rol → hazır set (eski ad; çağıranlar aynen çalışsın). */
export const COMPANY_ROLE_PERMISSIONS: Record<CompanyRole, readonly string[]> =
  COMPANY_ROLE_PRESETS as Record<CompanyRole, readonly string[]>;

/**
 * Yönetim etiketi taşıyan roller — Kurucu ve Yönetici. Etiket kontrolleri
 * (rol atama kapıları, admin-hedef koruması) bunu okur; YETKİ kontrolleri
 * `hasCompanyPermission` ile izne bakar.
 */
export const MANAGEMENT_ROLES: readonly CompanyRole[] = ["SAHIP", "YONETICI"];
export function hasManagementRole(roles: readonly CompanyRole[]): boolean {
  return roles.some((r) => MANAGEMENT_ROLES.includes(r));
}

/** Kapıların okuduğu asgari kullanıcı şekli (auth nesnesi bunu sağlar). */
export interface PermissionSubject {
  isOwner: boolean;
  permissions?: readonly string[] | null;
  roles?: readonly string[] | null;
}

/**
 * Kullanıcının verilen izne (dizi verilirse HERHANGİ BİRİNE) sahip olup
 * olmadığı — efektif liste üzerinden (kurucu örtük izinleri dahil).
 */
export function hasCompanyPermission(
  user: PermissionSubject,
  required: string | readonly string[],
): boolean {
  return sharedHasCompanyPermission(user, required);
}
