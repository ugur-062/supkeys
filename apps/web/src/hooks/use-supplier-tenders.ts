"use client";

import { supplierApi } from "@/lib/supplier-auth/api";
import type {
  ListSupplierTendersParams,
  SupplierTenderCategoryFilter,
  SupplierTenderDetail,
  SupplierTenderListResponse,
  SupplierTenderStats,
  SupplierTenderTenant,
} from "@/lib/tenders/types";
import { useQuery } from "@tanstack/react-query";

const KEYS = {
  all: ["supplier", "tenders"] as const,
  list: (params: ListSupplierTendersParams) =>
    [...KEYS.all, "list", params] as const,
  detail: (id: string) => [...KEYS.all, "detail", id] as const,
  stats: () => [...KEYS.all, "stats"] as const,
  filterTenants: () => [...KEYS.all, "filters", "tenants"] as const,
  filterCategories: () => [...KEYS.all, "filters", "categories"] as const,
};

function buildParams(params: ListSupplierTendersParams) {
  const p: Record<string, string | number> = {};
  if (params.filter) p.filter = params.filter;
  if (params.search) p.search = params.search;
  if (params.sort) p.sort = params.sort;
  if (params.range) p.range = params.range;
  if (params.tenantId) p.tenantId = params.tenantId;
  if (params.categoryId) p.categoryId = params.categoryId;
  if (params.page) p.page = params.page;
  if (params.pageSize) p.pageSize = params.pageSize;
  return p;
}

export function useSupplierTenderTenants() {
  return useQuery({
    queryKey: KEYS.filterTenants(),
    queryFn: async () => {
      const { data } = await supplierApi.get<SupplierTenderTenant[]>(
        "/supplier/tenders/filters/tenants",
      );
      return data;
    },
    staleTime: 60_000,
  });
}

export function useSupplierTenderCategoryOptions() {
  return useQuery({
    queryKey: KEYS.filterCategories(),
    queryFn: async () => {
      const { data } = await supplierApi.get<SupplierTenderCategoryFilter[]>(
        "/supplier/tenders/filters/categories",
      );
      return data;
    },
    staleTime: 60_000,
  });
}

export function useSupplierTenders(params: ListSupplierTendersParams) {
  return useQuery({
    queryKey: KEYS.list(params),
    queryFn: async () => {
      const { data } = await supplierApi.get<SupplierTenderListResponse>(
        "/supplier/tenders",
        { params: buildParams(params) },
      );
      return data;
    },
    placeholderData: (prev) => prev,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false, // P-6
  });
}

export function useSupplierTenderDetail(id: string | null) {
  return useQuery({
    queryKey: KEYS.detail(id ?? ""),
    queryFn: async () => {
      const { data } = await supplierApi.get<SupplierTenderDetail>(
        `/supplier/tenders/${id}`,
      );
      return data;
    },
    enabled: !!id,
    refetchInterval: 15_000,
    refetchIntervalInBackground: false, // P-6
  });
}

export function useSupplierTenderStats() {
  return useQuery({
    queryKey: KEYS.stats(),
    queryFn: async () => {
      const { data } = await supplierApi.get<SupplierTenderStats>(
        "/supplier/tenders/stats",
      );
      return data;
    },
    refetchInterval: 30_000,
    refetchIntervalInBackground: false, // P-6
    staleTime: 10_000,
  });
}

export const supplierTendersQueryKeys = KEYS;
