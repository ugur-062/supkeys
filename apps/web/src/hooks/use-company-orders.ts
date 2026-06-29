"use client";

import { companyApi } from "@/lib/company-auth/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export type CompanyOrderStatus =
  | "PENDING"
  | "ACCEPTED"
  | "CREATED"
  | "IN_DELIVERY"
  | "DELIVERED"
  | "COMPLETED"
  | "REJECTED"
  | "CANCELLED";

export type PaymentStatus =
  | "AWAITING_CONFIRMATION"
  | "CONFIRMED"
  | "REJECTED";

export type PaymentTiming = "BEFORE_DELIVERY" | "AFTER_DELIVERY";

export interface CompanyOrderItemRow {
  id: string;
  name: string;
  quantity: string;
  unit: string;
  unitPrice: string;
}

export interface OrderPayment {
  id: string;
  amount: string;
  method: string | null;
  note: string | null;
  status: PaymentStatus;
  rejectReason: string | null;
  recordedByCompanyId: string;
  confirmedAt: string | null;
  createdAt: string;
  chequeNo: string | null;
  chequeBank: string | null;
  chequeDueDate: string | null;
}

export interface CompanyOrder {
  id: string;
  number: string | null;
  amount: string;
  status: CompanyOrderStatus;
  role: "seller" | "buyer";
  counterparty: string;
  listingTitle: string | null;
  listingNumber: string | null;
  createdAt: string;
  items?: CompanyOrderItemRow[];
}

export interface CompanyOrderDetail extends CompanyOrder {
  paymentTiming: PaymentTiming;
  paymentOpen: boolean;
  paymentTotals: { confirmed: string; pending: string; remaining: string };
  payments: OrderPayment[];
  items: CompanyOrderItemRow[];
}

export function useOrders() {
  return useQuery({
    queryKey: ["company-orders", "list"],
    queryFn: async () => {
      const { data } = await companyApi.get<CompanyOrder[]>("/company/orders");
      return data;
    },
  });
}

export function useOrder(id: string) {
  return useQuery({
    queryKey: ["company-orders", "detail", id],
    queryFn: async () => {
      const { data } = await companyApi.get<CompanyOrderDetail>(
        `/company/orders/${id}`,
      );
      return data;
    },
  });
}

/** Teslimat akışı: ship | receive | complete. */
export function useOrderAction(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (action: "ship" | "receive" | "complete") => {
      const { data } = await companyApi.post(`/company/orders/${id}/${action}`);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["company-orders"] }),
  });
}

/** Satıcı: sipariş kabul. */
export function useAcceptOrder(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data } = await companyApi.post(`/company/orders/${id}/accept`);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["company-orders"] }),
  });
}

/** Satıcı: sipariş ret (gerekçeli). */
export function useRejectOrder(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (reason?: string) => {
      const { data } = await companyApi.post(`/company/orders/${id}/reject`, {
        reason,
      });
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["company-orders"] }),
  });
}

/** Alıcı: sipariş iptal (teslimat öncesi, gerekçeli). */
export function useCancelOrder(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (reason?: string) => {
      const { data } = await companyApi.post(`/company/orders/${id}/cancel`, {
        reason,
      });
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["company-orders"] }),
  });
}

/** Sipariş değerlendirmem (varsa). */
export function useOrderReview(orderId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["company-orders", "review", orderId],
    enabled,
    queryFn: async () => {
      const { data } = await companyApi.get<{
        rating: number;
        comment: string | null;
      } | null>(`/company/reviews/order/${orderId}`);
      return data;
    },
  });
}

/** Tedarikçiyi değerlendir (1-5 + yorum). */
export function useUpsertReview(orderId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { rating: number; comment?: string }) => {
      const { data } = await companyApi.post("/company/reviews", {
        orderId,
        ...input,
      });
      return data;
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["company-orders", "review", orderId] }),
  });
}

/** Alıcı: ödeme kaydı oluştur. */
export function useRecordPayment(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      amount: number;
      method?: string;
      note?: string;
      chequeNo?: string;
      chequeBank?: string;
      chequeDueDate?: string;
    }) => {
      const { data } = await companyApi.post(
        `/company/orders/${id}/payments`,
        input,
      );
      return data;
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["company-orders", "detail", id] }),
  });
}

/** Satıcı: ödeme onayla/reddet. */
export function usePaymentDecision(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      paymentId: string;
      decision: "confirm" | "reject";
      reason?: string;
    }) => {
      const { data } = await companyApi.post(
        `/company/orders/${id}/payments/${input.paymentId}/${input.decision}`,
        input.decision === "reject" ? { reason: input.reason } : undefined,
      );
      return data;
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["company-orders", "detail", id] }),
  });
}
