"use client";

import { api } from "@/lib/api";
import type {
  ApplicationListResponse,
  ApplicationStats,
  BuyerApplicationDetail,
  BuyerApplicationListItem,
  ListApplicationsParams,
  RejectApplicationInput,
} from "@/lib/applications/types";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

const KEYS = {
  all: ["admin", "buyer-applications"] as const,
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

export function useBuyerApplications(params: ListApplicationsParams) {
  return useQuery({
    queryKey: KEYS.list(params),
    queryFn: async () => {
      const { data } = await api.get<
        ApplicationListResponse<BuyerApplicationListItem>
      >("/admin/buyer-applications", {
        params: buildParams(params),
      });
      return data;
    },
    placeholderData: (prev) => prev,
    refetchInterval: REFETCH_INTERVAL_MS,
  });
}

export function useBuyerApplicationStats() {
  return useQuery({
    queryKey: KEYS.stats(),
    queryFn: async () => {
      const { data } = await api.get<ApplicationStats>(
        "/admin/buyer-applications/stats",
      );
      return data;
    },
    staleTime: 30 * 1000,
    refetchInterval: REFETCH_INTERVAL_MS,
  });
}

export function useBuyerApplicationDetail(id: string | null) {
  return useQuery({
    queryKey: KEYS.detail(id ?? ""),
    queryFn: async () => {
      const { data } = await api.get<BuyerApplicationDetail>(
        `/admin/buyer-applications/${id}`,
      );
      return data;
    },
    enabled: !!id,
  });
}

export function useApproveBuyerApplication(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data } = await api.post<{
        tenantId: string;
        tenantSlug: string;
        userId: string;
        message: string;
      }>(`/admin/buyer-applications/${id}/approve`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEYS.all });
      // Demo onaylanınca demo-requests stats/list de değişir
      queryClient.invalidateQueries({
        queryKey: ["admin", "demo-requests"],
      });
    },
  });
}

export function useRejectBuyerApplication(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: RejectApplicationInput) => {
      const { data } = await api.post<{ message: string }>(
        `/admin/buyer-applications/${id}/reject`,
        input,
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEYS.all });
    },
  });
}

export const buyerApplicationQueryKeys = KEYS;
