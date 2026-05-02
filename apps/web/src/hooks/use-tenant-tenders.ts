"use client";

import { api } from "@/lib/api";
import type {
  ListTendersParams,
  TenderDetail,
  TenderListResponse,
  TenderStats,
} from "@/lib/tenders/types";
import { useQuery } from "@tanstack/react-query";

const KEYS = {
  all: ["tenant", "tenders"] as const,
  list: (params: ListTendersParams) => [...KEYS.all, "list", params] as const,
  detail: (id: string) => [...KEYS.all, "detail", id] as const,
  stats: () => [...KEYS.all, "stats"] as const,
};

function buildParams(params: ListTendersParams) {
  const p: Record<string, string | number> = {};
  if (params.status) p.status = params.status;
  if (params.search) p.search = params.search;
  if (params.page) p.page = params.page;
  if (params.pageSize) p.pageSize = params.pageSize;
  return p;
}

export function useTenders(params: ListTendersParams) {
  return useQuery({
    queryKey: KEYS.list(params),
    queryFn: async () => {
      const { data } = await api.get<TenderListResponse>(
        "/tenants/me/tenders",
        { params: buildParams(params) },
      );
      return data;
    },
    placeholderData: (prev) => prev,
    refetchInterval: 30_000,
  });
}

export function useTenderDetail(id: string | null) {
  return useQuery({
    queryKey: KEYS.detail(id ?? ""),
    queryFn: async () => {
      const { data } = await api.get<TenderDetail>(
        `/tenants/me/tenders/${id}`,
      );
      return data;
    },
    enabled: !!id,
    refetchInterval: 15_000,
  });
}

export function useTenderStats() {
  return useQuery({
    queryKey: KEYS.stats(),
    queryFn: async () => {
      const { data } = await api.get<TenderStats>(
        "/tenants/me/tenders/stats",
      );
      return data;
    },
    refetchInterval: 30_000,
    staleTime: 10_000,
  });
}

export const tenantTendersQueryKeys = KEYS;
