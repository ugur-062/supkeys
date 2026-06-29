"use client";

import { api } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export interface AdminCompanyRow {
  id: string;
  supkeysId: string | null;
  name: string;
  taxNumber: string | null;
  country: string;
  tier: "STANDARD" | "PAKET";
  verification: "UNVERIFIED" | "PENDING" | "VERIFIED" | "REJECTED";
  isBlocked: boolean;
  complaintCount: number;
  createdAt: string;
}

export function useAdminCompanies(params: {
  status?: string;
  blocked?: string;
  q?: string;
}) {
  return useQuery({
    queryKey: ["admin-companies", params],
    queryFn: async () => {
      const { data } = await api.get<AdminCompanyRow[]>("/admin/companies", {
        params,
      });
      return data;
    },
  });
}

export function useCompanyAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      action,
      reason,
    }: {
      id: string;
      action: "verify" | "reject" | "suspend" | "unsuspend";
      reason?: string;
    }) => {
      await api.post(
        `/admin/companies/${id}/${action}`,
        action === "suspend" ? { reason } : {},
      );
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["admin-companies"] }),
  });
}

export function useSetCompanyTier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      tier,
      months,
    }: {
      id: string;
      tier: "STANDARD" | "PAKET";
      months?: number;
    }) => {
      await api.post(`/admin/companies/${id}/tier`, { tier, months });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-companies"] }),
  });
}

export interface AdminComplaint {
  id: string;
  complainant: { name: string; supkeysId: string | null };
  against: { id: string; name: string; supkeysId: string | null };
  reason: string;
  detail: string | null;
  status: "OPEN" | "RESOLVED" | "DISMISSED";
  adminNote: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export function useAdminComplaints(status?: string) {
  return useQuery({
    queryKey: ["admin-complaints", status],
    queryFn: async () => {
      const { data } = await api.get<AdminComplaint[]>("/admin/complaints", {
        params: status ? { status } : {},
      });
      return data;
    },
  });
}

export function useResolveComplaint() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      status: "RESOLVED" | "DISMISSED";
      adminNote?: string;
      suspend?: boolean;
    }) => {
      const { id, ...body } = input;
      await api.post(`/admin/complaints/${id}/resolve`, body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-complaints"] });
      qc.invalidateQueries({ queryKey: ["admin-companies"] });
    },
  });
}
