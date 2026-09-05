import {
  ALL_SEAT_PERMISSIONS,
  BUY_SEAT_PERMISSIONS,
  SELL_SEAT_PERMISSIONS,
  effectivePermissions,
  hasCompanyPermission,
  hasManagementPermission,
} from "@rothern/shared";

/**
 * Web tarafı izin aynası — TEK KAYNAK `@rothern/shared`
 * `constants/company-permissions.ts` (API kapılarıyla aynı katalog ve aynı
 * türetme). Kullanıcı nesnesi `/me`'den `permissions` taşır; eski önbellek
 * yalnız `roles` taşıyorsa hazır sete düşülür (API `effectivePermissions`
 * ile aynı geçiş emniyeti).
 */
export interface PermissionSubject {
  isOwner?: boolean;
  permissions?: readonly string[] | null;
  roles?: readonly string[] | null;
}

export function userPermissions(
  user: PermissionSubject | null | undefined,
): string[] {
  if (!user) return [];
  return effectivePermissions({
    isOwner: !!user.isOwner,
    permissions: user.permissions,
    roles: user.roles,
  });
}

/** Tek izin ya da herhangi biri (dizi). */
export function userHasPermission(
  user: PermissionSubject | null | undefined,
  required: string | readonly string[],
): boolean {
  if (!user) return false;
  return hasCompanyPermission(
    {
      isOwner: !!user.isOwner,
      permissions: user.permissions,
      roles: user.roles,
    },
    required,
  );
}

/** Herhangi bir İŞLEM (koltuk) izni — AI asistan/AI arama kapısı. */
export function hasAnySeatPermission(
  user: PermissionSubject | null | undefined,
): boolean {
  return userHasPermission(user, ALL_SEAT_PERMISSIONS);
}

export function hasBuySeatPermission(
  user: PermissionSubject | null | undefined,
): boolean {
  return userHasPermission(user, BUY_SEAT_PERMISSIONS);
}

export function hasSellSeatPermission(
  user: PermissionSubject | null | undefined,
): boolean {
  return userHasPermission(user, SELL_SEAT_PERMISSIONS);
}

/** Yönetim: Kurucu ya da "kullanıcı ve yetki" / "firma profili ve ayarlar". */
export function isManagementUser(
  user: PermissionSubject | null | undefined,
): boolean {
  if (!user) return false;
  return !!user.isOwner || hasManagementPermission(userPermissions(user));
}
