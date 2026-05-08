"use client";

import { api } from "@/lib/api";
import type {
  ListOrdersParams,
  OrderDetail,
  OrderListResponse,
  OrderStats,
} from "@/lib/tenders/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

const KEYS = {
  all: ["tenant", "orders"] as const,
  list: (params: ListOrdersParams) => [...KEYS.all, "list", params] as const,
  detail: (id: string) => [...KEYS.all, "detail", id] as const,
  stats: () => [...KEYS.all, "stats"] as const,
};

export function useOrders(params: ListOrdersParams) {
  return useQuery({
    queryKey: KEYS.list(params),
    queryFn: async () => {
      const { data } = await api.get<OrderListResponse>(
        "/tenants/me/orders",
        {
          params: {
            ...(params.status ? { status: params.status } : {}),
            ...(params.search ? { search: params.search } : {}),
            ...(params.supplierId ? { supplierId: params.supplierId } : {}),
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

export function useOrderStats() {
  return useQuery({
    queryKey: KEYS.stats(),
    queryFn: async () => {
      const { data } = await api.get<OrderStats>("/tenants/me/orders/stats");
      return data;
    },
    refetchInterval: 30_000,
    staleTime: 10_000,
  });
}

export function useOrderDetail(id: string | null) {
  return useQuery({
    queryKey: KEYS.detail(id ?? ""),
    queryFn: async () => {
      const { data } = await api.get<OrderDetail>(`/tenants/me/orders/${id}`);
      return data;
    },
    enabled: !!id,
  });
}

// V1.5 — Order workflow mutations

export function useCompleteOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; completedNote?: string }) => {
      const { data } = await api.post<OrderDetail>(
        `/tenants/me/orders/${input.id}/complete`,
        { completedNote: input.completedNote },
      );
      return data;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: KEYS.all });
      qc.invalidateQueries({ queryKey: KEYS.detail(vars.id) });
    },
  });
}

export function useCancelOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; reason: string }) => {
      const { data } = await api.post<OrderDetail>(
        `/tenants/me/orders/${input.id}/cancel`,
        { reason: input.reason },
      );
      return data;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: KEYS.all });
      qc.invalidateQueries({ queryKey: KEYS.detail(vars.id) });
    },
  });
}

export const tenantOrdersQueryKeys = KEYS;
