"use client";

import { api } from "@/lib/api";
import type {
  BlockSupplierInput,
  ListSuppliersParams,
  SupplierListResponse,
  SupplierStats,
  SupplierWithRelation,
} from "@/lib/tedarikciler/types";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

const KEYS = {
  all: ["tenant", "suppliers"] as const,
  list: (params: ListSuppliersParams) =>
    [...KEYS.all, "list", params] as const,
  detail: (id: string) => [...KEYS.all, "detail", id] as const,
  stats: () => [...KEYS.all, "stats"] as const,
};

function buildParams(params: ListSuppliersParams) {
  const p: Record<string, string | number> = {};
  if (params.status) p.status = params.status;
  if (params.search) p.search = params.search;
  if (params.page) p.page = params.page;
  if (params.pageSize) p.pageSize = params.pageSize;
  return p;
}

export function useSuppliers(params: ListSuppliersParams) {
  return useQuery({
    queryKey: KEYS.list(params),
    queryFn: async () => {
      const { data } = await api.get<SupplierListResponse>(
        "/tenants/me/suppliers",
        { params: buildParams(params) },
      );
      return data;
    },
    placeholderData: (prev) => prev,
  });
}

export function useSupplierStats() {
  return useQuery({
    queryKey: KEYS.stats(),
    queryFn: async () => {
      const { data } = await api.get<SupplierStats>(
        "/tenants/me/suppliers/stats",
      );
      return data;
    },
    staleTime: 30 * 1000,
  });
}

export function useSupplierDetail(id: string | null) {
  return useQuery({
    queryKey: KEYS.detail(id ?? ""),
    queryFn: async () => {
      const { data } = await api.get<SupplierWithRelation>(
        `/tenants/me/suppliers/${id}`,
      );
      return data;
    },
    enabled: !!id,
  });
}

export function useBlockSupplier(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: BlockSupplierInput) => {
      const { data } = await api.post<SupplierWithRelation>(
        `/tenants/me/suppliers/${id}/block`,
        input,
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEYS.all });
    },
  });
}

export function useUnblockSupplier(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data } = await api.post<SupplierWithRelation>(
        `/tenants/me/suppliers/${id}/unblock`,
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEYS.all });
    },
  });
}

export const tenantSuppliersQueryKeys = KEYS;
