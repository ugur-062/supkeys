"use client";

import { api } from "@/lib/api";
import type { AdminRole } from "@/lib/auth/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export interface StaffRow {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: AdminRole;
  isActive: boolean;
  twoFactorEnabled: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export function useStaff() {
  return useQuery({
    queryKey: ["admin-staff"],
    queryFn: async () => {
      const { data } = await api.get<StaffRow[]>("/admin/staff");
      return data;
    },
  });
}

export function useCreateStaff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      email: string;
      firstName: string;
      lastName: string;
      role: AdminRole;
    }) => {
      const { data } = await api.post<{
        ok: boolean;
        id: string;
        tempPassword: string;
      }>("/admin/staff", input);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-staff"] }),
  });
}

export function useStaffAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      input:
        | { id: string; action: "role"; role: AdminRole }
        | { id: string; action: "active"; active: boolean }
        | { id: string; action: "reset-password" },
    ) => {
      const { id, action, ...body } = input;
      const { data } = await api.post<{ ok: boolean; tempPassword?: string }>(
        `/admin/staff/${id}/${action}`,
        body,
      );
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-staff"] }),
  });
}

// ── Hesap güvenliği (self) ───────────────────────────────────

export function useChangePassword() {
  return useMutation({
    mutationFn: async (input: { current: string; next: string }) => {
      await api.post("/admin/auth/change-password", input);
    },
  });
}

export function useTwoFactor() {
  const qc = useQueryClient();
  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["admin", "auth", "me"] });
  const setup = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<{ secret: string; otpauthUrl: string }>(
        "/admin/auth/2fa/setup",
      );
      return data;
    },
  });
  const enable = useMutation({
    mutationFn: async (input: { secret: string; code: string }) => {
      await api.post("/admin/auth/2fa/enable", input);
    },
    onSuccess: invalidate,
  });
  const disable = useMutation({
    mutationFn: async (input: { code: string }) => {
      await api.post("/admin/auth/2fa/disable", input);
    },
    onSuccess: invalidate,
  });
  return { setup, enable, disable };
}
