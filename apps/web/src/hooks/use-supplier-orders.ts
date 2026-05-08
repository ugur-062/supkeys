"use client";

import { supplierApi } from "@/lib/supplier-auth/api";
import type {
  ListOrdersParams,
  OrderDetail,
  OrderListResponse,
  OrderStats,
} from "@/lib/tenders/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

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

// V1.5 — PDF download (supplier scope)

export function useDownloadSupplierOrderPdf() {
  return useMutation({
    mutationFn: async (input: { id: string; orderNumber: string }) => {
      const response = await supplierApi.get(
        `/supplier/orders/${input.id}/pdf`,
        { responseType: "blob" },
      );
      const blob = new Blob([response.data as BlobPart], {
        type: "application/pdf",
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Siparis-${input.orderNumber}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    },
  });
}

// V1.5 — Tedarikçi PENDING → IN_DELIVERY mutation

export function useStartDelivery() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      deliveryNote?: string;
      expectedDeliveryDate?: string;
    }) => {
      const { data } = await supplierApi.post<OrderDetail>(
        `/supplier/orders/${input.id}/start-delivery`,
        {
          deliveryNote: input.deliveryNote,
          expectedDeliveryDate: input.expectedDeliveryDate,
        },
      );
      return data;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: KEYS.all });
      qc.invalidateQueries({ queryKey: KEYS.detail(vars.id) });
    },
  });
}

export const supplierOrdersQueryKeys = KEYS;
