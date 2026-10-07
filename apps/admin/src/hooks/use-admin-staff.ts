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
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { current: string; next: string }) => {
      await api.post("/admin/auth/change-password", input);
    },
    // Geçici parola kilidi (D-025) kalktı → /me tazelenir, store bayrağı düşer,
    // RequireAdminAuth paneli açar.
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "auth", "me"] }),
  });
}
