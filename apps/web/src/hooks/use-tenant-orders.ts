"use client";

import { api } from "@/lib/api";
import { extractBlobErrorMessage } from "@/lib/tenders/error";
import type {
  ListOrdersParams,
  OrderCounterpart,
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
  counterparts: () => [...KEYS.all, "counterparts"] as const,
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
            ...(params.range ? { range: params.range } : {}),
            ...(params.sort ? { sort: params.sort } : {}),
            ...(params.page ? { page: params.page } : {}),
            ...(params.pageSize ? { pageSize: params.pageSize } : {}),
          },
        },
      );
      return data;
    },
    placeholderData: (prev) => prev,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false, // P-6
    staleTime: 10_000, // P-7
  });
}

/** Alıcının sipariş geçmişindeki distinct tedarikçi listesi. */
export function useOrderCounterparts() {
  return useQuery({
    queryKey: KEYS.counterparts(),
    queryFn: async () => {
      const { data } = await api.get<
        Array<{ id: string; companyName: string; orderCount: number }>
      >("/tenants/me/orders/counterparts");
      return data.map<OrderCounterpart>((it) => ({
        id: it.id,
        label: it.companyName,
        orderCount: it.orderCount,
      }));
    },
    staleTime: 60_000,
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
    refetchIntervalInBackground: false, // P-6
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
    staleTime: 10_000, // P-7
  });
}

// V1.5 — PDF download (tenant scope)

function triggerBrowserDownload(blobData: BlobPart, filename: string): void {
  const blob = new Blob([blobData], { type: "application/pdf" });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
}

export function useDownloadTenantOrderPdf() {
  return useMutation({
    mutationFn: async (input: { id: string; orderNumber: string }) => {
      try {
        const response = await api.get(`/tenants/me/orders/${input.id}/pdf`, {
          responseType: "blob",
        });
        triggerBrowserDownload(
          response.data as BlobPart,
          `Siparis-${input.orderNumber}.pdf`,
        );
      } catch (err) {
        // Blob endpoint — hata gövdesi Blob olarak gelir; mesajı ayıkla.
        throw new Error(await extractBlobErrorMessage(err, "PDF indirilemedi"));
      }
    },
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
