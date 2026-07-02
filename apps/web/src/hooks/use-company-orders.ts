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
  /** Tutarın para birimi — kazanan teklifin birimi (legacy → TRY). */
  currency: string;
  status: CompanyOrderStatus;
  role: "seller" | "buyer";
  counterparty: string;
  counterpartyCompanyId: string;
  listingId: string | null;
  listingTitle: string | null;
  listingType: "ALIM" | "SATIS" | null;
  listingNumber: string | null;
  createdAt: string;
  items?: CompanyOrderItemRow[];
}

/** Karşı tarafın kurumsal özeti (sipariş detayında gösterilir). */
export interface CounterpartyProfile {
  city: string | null;
  industry: string | null;
  email: string | null;
  phone: string | null;
  supkeysId: string | null;
}

export interface CompanyOrderDetail extends CompanyOrder {
  counterpartyProfile: CounterpartyProfile;
  paymentTiming: PaymentTiming;
  paymentOpen: boolean;
  paymentTotals: { confirmed: string; pending: string; remaining: string };
  payments: OrderPayment[];
  items: CompanyOrderItemRow[];
  // Adım verileri + timeline (eski sistemle birebir)
  acceptedAt: string | null;
  acceptedNote: string | null;
  bankAccountHolder: string | null;
  bankIban: string | null;
  expectedDeliveryDate: string | null;
  invoiceNumber: string | null;
  deliveryStartedAt: string | null;
  deliveryNote: string | null;
  deliveredAt: string | null;
  completedAt: string | null;
  completedNote: string | null;
  rejectedAt: string | null;
  rejectedReason: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
}

export interface AcceptOrderInput {
  expectedDeliveryDate: string;
  acceptedNote?: string;
  /** Ayarlar → Banka Hesapları'ndan seçilen hesap (IBAN elle girilmez). */
  bankAccountId?: string;
}

export function useOrders() {
  return useQuery({
    queryKey: ["company-orders", "list"],
    queryFn: async () => {
      const { data } = await companyApi.get<CompanyOrder[]>("/company/orders");
      return data;
    },
    // Karşı tarafın adımları (onay/kargo/ödeme) yenilemeden görünsün.
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
}

const ORDER_TERMINAL = new Set(["COMPLETED", "REJECTED", "CANCELLED"]);

export function useOrder(id: string) {
  return useQuery({
    queryKey: ["company-orders", "detail", id],
    queryFn: async () => {
      const { data } = await companyApi.get<CompanyOrderDetail>(
        `/company/orders/${id}`,
      );
      return data;
    },
    // Aktif siparişte karşı tarafın adımı (onay/kargo/ödeme kararı)
    // yenilemeden görünsün; kapanmış sipariş poll'lanmaz.
    refetchInterval: (query) => {
      const d = query.state.data;
      if (!d || ORDER_TERMINAL.has(d.status)) return false;
      return 10_000;
    },
    refetchOnWindowFocus: true,
  });
}

/** Satıcı: kargoya ver (fatura no zorunlu + gönderim notu). */
export function useShipOrder(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { invoiceNumber: string; deliveryNote?: string }) => {
      const { data } = await companyApi.post(`/company/orders/${id}/ship`, input);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["company-orders"] }),
  });
}

/** Alıcı: teslim al (opsiyonel not). */
export function useReceiveOrder(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input?: { note?: string }) => {
      const { data } = await companyApi.post(
        `/company/orders/${id}/receive`,
        input ?? {},
      );
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["company-orders"] }),
  });
}

/** Alıcı: siparişi tamamla (opsiyonel not). */
export function useCompleteOrder(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input?: { note?: string }) => {
      const { data } = await companyApi.post(
        `/company/orders/${id}/complete`,
        input ?? {},
      );
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["company-orders"] }),
  });
}

/** Satıcı: sipariş kabul (teslim tarihi + banka + not). */
export function useAcceptOrder(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: AcceptOrderInput) => {
      const { data } = await companyApi.post(
        `/company/orders/${id}/accept`,
        input,
      );
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
