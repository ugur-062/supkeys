"use client";

// Faz 3 — Alıcı "Gelen İstekler" (Tedarikçi Ol başvuruları).

import { api } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export interface ConnectionRequestSupplier {
  id: string;
  companyName: string;
  companyType: "JOINT_STOCK" | "LIMITED" | "SOLE_PROPRIETOR";
  taxNumber: string;
  taxOffice: string;
  industry: string | null;
  website: string | null;
  city: string;
  district: string;
  taxCertUrl: string;
  membership: "STANDARD" | "PREMIUM";
  categories: { nameTr: string; segmentLetter: string | null }[];
}

export interface ConnectionRequest {
  id: string;
  requestedAt: string;
  supplier: ConnectionRequestSupplier;
}

const KEY = ["connection-requests"] as const;
const COUNT_KEY = ["connection-requests", "count"] as const;

export function useConnectionRequests() {
  return useQuery({
    queryKey: KEY,
    queryFn: async () => {
      const { data } = await api.get<ConnectionRequest[]>(
        "/tenants/me/connection-requests",
      );
      return data;
    },
  });
}

export function useConnectionRequestsCount() {
  return useQuery({
    queryKey: COUNT_KEY,
    queryFn: async () => {
      const { data } = await api.get<{ count: number }>(
        "/tenants/me/connection-requests/count",
      );
      return data.count;
    },
  });
}

export function useApproveConnectionRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.post(
        `/tenants/me/connection-requests/${id}/approve`,
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ["suppliers"] });
    },
  });
}

export function useRejectConnectionRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.post(
        `/tenants/me/connection-requests/${id}/reject`,
      );
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
