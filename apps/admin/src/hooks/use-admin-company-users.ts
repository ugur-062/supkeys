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
