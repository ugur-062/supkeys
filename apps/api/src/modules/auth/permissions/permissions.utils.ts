import type { UserRole } from "@supkeys/db";
import { ROLE_DEFAULT_PERMISSIONS } from "./permissions.constants";

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
 */
export function resolveUserPermissions(
  role: UserRole,
  override: unknown,
): string[] {
  const rolePerms = ROLE_DEFAULT_PERMISSIONS[role] ?? [];

  if (!override || typeof override !== "object") return [...rolePerms];

  const { added = [], removed = [] } = override as PermissionsOverride;

  const final = new Set<string>();
  for (const p of rolePerms) {
    if (!removed.includes(p)) final.add(p);
  }
  for (const p of added) {
    final.add(p);
  }
  return Array.from(final);
}

export function hasPermission(
  role: UserRole,
  override: unknown,
  permission: string,
): boolean {
  return resolveUserPermissions(role, override).includes(permission);
}
