"use client";

import { api } from "@/lib/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";

export const TENDER_CANCELLABLE = [
  "DRAFT",
  "IN_APPROVAL",
  "OPEN_FOR_BIDS",
  "IN_AWARD",
];
export const ORDER_CANCELLABLE = [
  "PENDING",
  "ACCEPTED",
  "IN_DELIVERY",
  "IN_PROGRESS",
];

export function useAdminCancelTender(tenantId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { tenderId: string; reason: string }) => {
      const { data } = await api.post(
        `/admin/tenders/${input.tenderId}/cancel`,
        { reason: input.reason },
      );
      return data;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["admin", "tenants", "detail", tenantId],
      }),
  });
}

export function useAdminCancelOrder(tenantId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { orderId: string; reason: string }) => {
      const { data } = await api.post(`/admin/orders/${input.orderId}/cancel`, {
        reason: input.reason,
      });
      return data;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["admin", "tenants", "detail", tenantId],
      }),
  });
}
