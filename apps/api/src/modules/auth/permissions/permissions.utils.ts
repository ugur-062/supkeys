import type { UserRole } from "@supkeys/db";
import {
  FORBIDDEN_PERMISSIONS_BY_ROLE,
  ROLE_DEFAULT_PERMISSIONS,
} from "./permissions.constants";

export interface PermissionsOverride {
  added?: string[];
  removed?: string[];
}

/**
 * Kullanıcının efektif permission listesini hesaplar:
 * - Role default'u baz alınır.
 * - override.removed: bu listeden çıkarılır.
 * - override.added: bu listeye eklenir (zaten varsa duplicate edilmez).
 * - null override → saf role default.
 * - FORBIDDEN_PERMISSIONS_BY_ROLE: rol bazında yasak izinler her durumda
 *   filtrelenir (override.added bile verse efektif listede çıkmaz).
 */
export function resolveUserPermissions(
  role: UserRole,
  override: unknown,
): string[] {
  const rolePerms = ROLE_DEFAULT_PERMISSIONS[role] ?? [];
  const forbidden = new Set(FORBIDDEN_PERMISSIONS_BY_ROLE[role] ?? []);

  if (!override || typeof override !== "object") {
    return rolePerms.filter((p) => !forbidden.has(p));
  }

  const { added = [], removed = [] } = override as PermissionsOverride;

  const final = new Set<string>();
  for (const p of rolePerms) {
    if (!removed.includes(p)) final.add(p);
  }
  for (const p of added) {
    final.add(p);
  }
  // Yasak izinleri her durumda çıkar — savunma katmanı.
  for (const p of forbidden) final.delete(p);
  return Array.from(final);
}

export function hasPermission(
  role: UserRole,
  override: unknown,
  permission: string,
): boolean {
  return resolveUserPermissions(role, override).includes(permission);
}
