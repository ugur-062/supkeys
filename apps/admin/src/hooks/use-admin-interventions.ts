"use client";

import { api } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export interface AdminTenderDetail {
  id: string;
  tenderNumber: string;
  title: string;
  description: string | null;
  type: string;
  visibility: string;
  status: string;
  primaryCurrency: string;
  bidsOpenAt: string | null;
  bidsCloseAt: string;
  publishedAt: string | null;
  awardedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  createdAt: string;
  paymentTerm: string;
  paymentDays: number | null;
  deliveryTerm: string | null;
  termsAndConditions: string | null;
  tenant: { id: string; name: string };
  createdBy: { firstName: string; lastName: string; email: string };
  categories: Array<{ id: string; code: string; nameTr: string; level: number }>;
  items: Array<{
    id: string;
    name: string;
    description: string | null;
    quantity: string | number;
    unit: string;
    targetUnitPrice: string | null;
  }>;
  invitations: Array<{
    status: string;
    invitedAt: string;
    respondedAt: string | null;
    supplier: { id: string; companyName: string };
  }>;
  bids: Array<{
    id: string;
    status: string;
    totalAmount: string;
    currency: string;
    version: number;
    submittedAt: string | null;
    eliminationReason: string | null;
    supplier: { id: string; companyName: string };
  }>;
  orders: Array<{
    id: string;
    orderNumber: string;
    status: string;
    totalAmount: string;
    currency: string;
    supplier: { companyName: string };
  }>;
}

export interface AdminOrderDetail {
  id: string;
  orderNumber: string;
  status: string;
  totalAmount: string;
  currency: string;
  notes: string | null;
  createdAt: string;
  acceptedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  tenant: { id: string; name: string };
  supplier: { id: string; companyName: string };
  tender: { id: string; tenderNumber: string; title: string };
  bid: { id: string; totalAmount: string; currency: string; version: number } | null;
  payments: Array<{
    id: string;
    method: string;
    amount: string;
    currency: string;
    status: "AWAITING_CONFIRMATION" | "CONFIRMED" | "REJECTED";
    note: string | null;
    chequeNo: string | null;
    chequeBank: string | null;
    chequeDueDate: string | null;
    markedPaidAt: string;
    confirmedAt: string | null;
    rejectedAt: string | null;
    rejectReason: string | null;
  }>;
}

export const ORDER_STATUS_OPTIONS = [
  "PENDING",
  "ACCEPTED",
  "IN_DELIVERY",
  "COMPLETED",
  "REJECTED",
  "CANCELLED",
];

export function useAdminTenderDetail(id: string | null | undefined) {
  return useQuery({
    queryKey: ["admin", "tender-detail", id ?? ""],
    queryFn: async () => {
      const { data } = await api.get<AdminTenderDetail>(`/admin/tenders/${id}`);
      return data;
    },
    enabled: Boolean(id),
    staleTime: 20_000,
  });
}

export function useAdminOrderDetail(id: string | null | undefined) {
  return useQuery({
    queryKey: ["admin", "order-detail", id ?? ""],
    queryFn: async () => {
      const { data } = await api.get<AdminOrderDetail>(`/admin/orders/${id}`);
      return data;
    },
    enabled: Boolean(id),
    staleTime: 20_000,
  });
}

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

export function useAdminSetOrderStatus(orderId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { status: string; reason?: string }) => {
      const { data } = await api.patch(`/admin/orders/${orderId}/status`, input);
      return data;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["admin", "order-detail", orderId],
      }),
  });
}

export function useAdminSetPaymentStatus(orderId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      paymentId: string;
      status: "CONFIRMED" | "REJECTED";
      reason?: string;
    }) => {
      const { data } = await api.patch(
        `/admin/orders/${orderId}/payments/${input.paymentId}`,
        { status: input.status, reason: input.reason },
      );
      return data;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["admin", "order-detail", orderId],
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
