"use client";

import { useAuth } from "@/hooks/use-auth";

/**
 * Creator-based ACL helper for tender ve order action'ları.
 *
 * Bir BUYER ekibin diğer BUYER'larının ihalesine karışamaz — sadece
 * görüntüleyebilir. COMPANY_ADMIN override eder.
 *
 * @returns `canAct` — kullanıcı bu ihale üzerinde action yapabilir mi?
 *          `owner` — ihalenin sahibi (`null` ise tender yüklenmemiş).
 *          `isOwnerMe` — kullanıcı sahibi mi?
 *          `isAdmin` — COMPANY_ADMIN rolünde mi?
 */
export function useTenderOwnership(
  createdBy: { id: string; firstName: string; lastName: string } | null | undefined,
): {
  canAct: boolean;
  owner: { id: string; firstName: string; lastName: string } | null;
  isOwnerMe: boolean;
  isAdmin: boolean;
} {
  const { user } = useAuth();
  if (!user || !createdBy) {
    return { canAct: false, owner: createdBy ?? null, isOwnerMe: false, isAdmin: false };
  }
  const isAdmin = user.role === "COMPANY_ADMIN";
  const isOwnerMe = createdBy.id === user.id;
  return {
    canAct: isAdmin || isOwnerMe,
    owner: createdBy,
    isOwnerMe,
    isAdmin,
  };
}
