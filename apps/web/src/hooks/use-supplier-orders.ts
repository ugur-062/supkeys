"use client";

import { supplierApi } from "@/lib/supplier-auth/api";
import type {
  ListOrdersParams,
  OrderDetail,
  OrderListResponse,
  OrderStats,
} from "@/lib/tenders/types";
import { useQuery } from "@tanstack/react-query";

const KEYS = {
  all: ["supplier", "orders"] as const,
  list: (params: ListOrdersParams) => [...KEYS.all, "list", params] as const,
  detail: (id: string) => [...KEYS.all, "detail", id] as const,
  stats: () => [...KEYS.all, "stats"] as const,
};

export function useSupplierOrders(params: ListOrdersParams) {
  return useQuery({
    queryKey: KEYS.list(params),
    queryFn: async () => {
      const { data } = await supplierApi.get<OrderListResponse>(
        "/supplier/orders",
        {
          params: {
            ...(params.status ? { status: params.status } : {}),
            ...(params.search ? { search: params.search } : {}),
            ...(params.page ? { page: params.page } : {}),
            ...(params.pageSize ? { pageSize: params.pageSize } : {}),
          },
        },
      );
      return data;
    },
    placeholderData: (prev) => prev,
    refetchInterval: 30_000,
  });
}

export function useSupplierOrderStats() {
  return useQuery({
    queryKey: KEYS.stats(),
    queryFn: async () => {
      const { data } = await supplierApi.get<OrderStats>(
        "/supplier/orders/stats",
      );
      return data;
    },
    refetchInterval: 30_000,
    staleTime: 10_000,
  });
}

export function useSupplierOrderDetail(id: string | null) {
  return useQuery({
    queryKey: KEYS.detail(id ?? ""),
    queryFn: async () => {
      const { data } = await supplierApi.get<OrderDetail>(
        `/supplier/orders/${id}`,
      );
      return data;
    },
    enabled: !!id,
  });
}

export const supplierOrdersQueryKeys = KEYS;
