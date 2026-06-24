"use client";

import { api } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export interface ConnectionItem {
  id: string;
  status: "ACTIVE" | "PENDING_TENANT_APPROVAL" | "BLOCKED";
  origin: string;
  requestedAt: string | null;
  decidedAt: string | null;
  blockedAt: string | null;
  blockedReason: string | null;
  createdAt: string;
  supplier: { id: string; companyName: string; membership: "STANDARD" | "PREMIUM" };
  tenant: { id: string; name: string };
}

export interface ConnectionsResponse {
  items: ConnectionItem[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

export interface ConnectionsParams {
  supplierId?: string;
  tenantId?: string;
  status?: string;
  search?: string;
  page?: number;
}

export function useAdminConnections(params: ConnectionsParams = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v) qs.set(k, String(v));
  }
  const q = qs.toString();
  return useQuery({
    queryKey: ["admin", "connections", params],
    queryFn: async () => {
      const { data } = await api.get<ConnectionsResponse>(
        `/admin/connections${q ? `?${q}` : ""}`,
      );
      return data;
    },
    placeholderData: (prev) => prev,
    staleTime: 20_000,
  });
}

export function useUpdateConnection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      status: "ACTIVE" | "BLOCKED";
      blockedReason?: string;
    }) => {
      const { data } = await api.patch(`/admin/connections/${input.id}`, {
        status: input.status,
        blockedReason: input.blockedReason,
      });
      return data;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["admin", "connections"] }),
  });
}

export function useRemoveConnection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.delete(`/admin/connections/${id}`);
      return data;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["admin", "connections"] }),
  });
}
