"use client";

import { api } from "@/lib/api";
import type {
  ApplicationListResponse,
  ApplicationStats,
  ListApplicationsParams,
  RejectApplicationInput,
  SupplierApplicationDetail,
  SupplierApplicationListItem,
} from "@/lib/applications/types";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

const KEYS = {
  all: ["admin", "supplier-applications"] as const,
  list: (params: ListApplicationsParams) =>
    [...KEYS.all, "list", params] as const,
  detail: (id: string) => [...KEYS.all, "detail", id] as const,
  stats: () => [...KEYS.all, "stats"] as const,
};

function buildParams(params: ListApplicationsParams) {
  const p: Record<string, string | number> = {};
  if (params.status) p.status = params.status;
  if (params.search) p.search = params.search;
  if (params.page) p.page = params.page;
  if (params.pageSize) p.pageSize = params.pageSize;
  return p;
}

const REFETCH_INTERVAL_MS = 5_000;

export function useSupplierApplications(params: ListApplicationsParams) {
  return useQuery({
    queryKey: KEYS.list(params),
    queryFn: async () => {
      const { data } = await api.get<
        ApplicationListResponse<SupplierApplicationListItem>
      >("/admin/supplier-applications", {
        params: buildParams(params),
      });
      return data;
    },
    placeholderData: (prev) => prev,
    refetchInterval: REFETCH_INTERVAL_MS,
  });
}

export function useSupplierApplicationStats() {
  return useQuery({
    queryKey: KEYS.stats(),
    queryFn: async () => {
      const { data } = await api.get<ApplicationStats>(
        "/admin/supplier-applications/stats",
      );
      return data;
    },
    staleTime: 30 * 1000,
    refetchInterval: REFETCH_INTERVAL_MS,
  });
}

export function useSupplierApplicationDetail(id: string | null) {
  return useQuery({
    queryKey: KEYS.detail(id ?? ""),
    queryFn: async () => {
      const { data } = await api.get<SupplierApplicationDetail>(
        `/admin/supplier-applications/${id}`,
      );
      return data;
    },
    enabled: !!id,
  });
}

export function useApproveSupplierApplication(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data } = await api.post<{
        supplierId: string;
        supplierUserId: string;
        message: string;
      }>(`/admin/supplier-applications/${id}/approve`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEYS.all });
    },
  });
}

export function useRejectSupplierApplication(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: RejectApplicationInput) => {
      const { data } = await api.post<{ message: string }>(
        `/admin/supplier-applications/${id}/reject`,
        input,
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEYS.all });
    },
  });
}

export const supplierApplicationQueryKeys = KEYS;
