"use client";

import { api } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export interface AdminCompanyUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  roles: string[];
  /** Kişiye yazılı izinler — rolsüz üyede "Görüntüleyici"/"Yetki yok" ayrımı. */
  permissions?: string[];
  isActive: boolean;
  emailVerifiedAt: string | null;
  twoFactorEnabled: boolean;
  lastLoginAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  isOwner: boolean;
}

export function useAdminCompanyUsers(companyId: string) {
  return useQuery({
    queryKey: ["admin-company-users", companyId],
    queryFn: async () => {
      const { data } = await api.get<AdminCompanyUser[]>(
        `/admin/companies/${companyId}/users`,
      );
      return data;
    },
  });
}

function invalidate(qc: ReturnType<typeof useQueryClient>, companyId: string) {
  qc.invalidateQueries({ queryKey: ["admin-company-users", companyId] });
  qc.invalidateQueries({ queryKey: ["admin-company-detail", companyId] });
}

/** Kurtarma aksiyonları — body'siz POST'lar (reset/verification/sessions). */
export function useUserRecoveryAction(companyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      userId,
      action,
    }: {
      userId: string;
      action: "password-reset" | "resend-verification" | "drop-sessions";
    }) => {
      await api.post(
        `/admin/companies/${companyId}/users/${userId}/${action}`,
      );
    },
    onSuccess: () => invalidate(qc, companyId),
  });
}

export function useSetUserActive(companyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      userId,
      active,
    }: {
      userId: string;
      active: boolean;
    }) => {
      await api.post(
        `/admin/companies/${companyId}/users/${userId}/active`,
        { active },
      );
    },
    onSuccess: () => invalidate(qc, companyId),
  });
}

export function useChangeUserEmail(companyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      userId,
      email,
    }: {
      userId: string;
      email: string;
    }) => {
      const { data } = await api.post<{ ok: boolean; email: string }>(
        `/admin/companies/${companyId}/users/${userId}/email`,
        { email },
      );
      return data;
    },
    onSuccess: () => invalidate(qc, companyId),
  });
}

export function useAddCompanyUser(companyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      email: string;
      firstName: string;
      lastName: string;
      role: string;
    }) => {
      const { data } = await api.post<{ ok: boolean; userId: string }>(
        `/admin/companies/${companyId}/users`,
        input,
      );
      return data;
    },
    onSuccess: () => invalidate(qc, companyId),
  });
}

/**
 * KVKK silme talebi (2026-10-16): giriş yapamayan kişinin `kvkk@` talebi.
 * Kişinin kendi silmesiyle aynı kurallar; ekipten çıkarılmış hesapta kalan ad
 * ve telefonu da siler. Geri alınamaz — yalnız SUPER_ADMIN.
 */
export function useEraseCompanyUser(companyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      const { data } = await api.post<{
        ok: boolean;
        companyClosed: boolean;
        alreadyRemoved: boolean;
      }>(`/admin/companies/${companyId}/users/${userId}/erase`);
      return data;
    },
    onSuccess: () => invalidate(qc, companyId),
  });
}

/** API `AccountDeletionService.adminErasurePreview` — onay penceresinin ön bilgisi. */
export interface AdminErasurePreview {
  name: string;
  /** Satırdaki adres; silme yer tutucusuysa null. */
  email: string | null;
  /** Ekipten çıkarılmış / silinmiş kaydın en son kullandığı adres (denetim kaydından; yoksa null). */
  lastKnownEmail: string | null;
  removedAt: string | null;
  /** Ad, telefon ve giriş zaten silinmiş: silinecek bir şey kalmadı. */
  nothingLeft: boolean;
  /** Başka canlı kullanıcı yok: silme firmayı da kapatır. */
  closesCompany: boolean;
  /** Firma başka bir nedenle (yönetici, şikâyet) askıda. */
  companySuspension: { reason: string | null; since: string | null } | null;
  /** Firmada aynı adı taşıyan başka kayıt sayısı (canlı ya da çıkarılmış). */
  sameNameCount: number;
  /** Doluysa API silmeyi 409 ile reddeder; pencere onayı sunmaz. */
  blocker: "ACCOUNT_CAN_SIGN_IN" | "ACCOUNT_COMPANY_SUSPENDED" | "COMPANY_ANONYMIZED" | null;
}

/**
 * KVKK silme onay penceresinin ön bilgisi (yalnız SUPER_ADMIN). Her açılışta
 * taze okunur: karar anındaki durum (askı, son kullanıcı) gösterilsin.
 */
export function useEraseUserPreview(companyId: string, userId: string | null) {
  return useQuery({
    queryKey: ["admin-company-user-erase-preview", companyId, userId],
    enabled: !!userId,
    staleTime: 0,
    gcTime: 0,
    queryFn: async () => {
      const { data } = await api.get<AdminErasurePreview>(
        `/admin/companies/${companyId}/users/${userId}/erase-preview`,
      );
      return data;
    },
  });
}
