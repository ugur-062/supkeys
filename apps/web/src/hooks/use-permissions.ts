"use client";

import { useAuth } from "@/hooks/use-auth";

/**
 * V2-6.5 — RBAC hook. Login response'undaki `permissions` array'ini kullanır.
 * Yetki kontrolü string-bazlı; alıcı paneli tarafı için.
 */
export function usePermissions() {
  const { user } = useAuth();
  const permissions = user?.permissions ?? [];

  const has = (permission: string): boolean => permissions.includes(permission);

  const hasAny = (...perms: string[]): boolean => perms.some((p) => has(p));

  const hasAll = (...perms: string[]): boolean => perms.every((p) => has(p));

  return { permissions, has, hasAny, hasAll };
}
