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
  | "CANCELLED"
  | "DISPUTED";

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
  /** Kalem-özel teslim tarihi (award snapshot, LEGACY) — boşsa order-level. */
  deliveryDate?: string | null;
  /** Kalem teslim SÜRESİ (BID_DELIVERY_TIMES; 2026-08-02 sonrası awardlar). */
  deliveryTime?: string | null;
  note?: string | null;
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
  // Yaşam döngüsü ayrımı: ödeme durumu türetilir (status'tan bağımsız). Liste
  // rozeti/KPI status yerine bunu kullanır. paymentDueDate = vade (varsa).
  paymentSettled?: boolean;
  paymentDueDate?: string | null;
  createdAt: string;
  items?: CompanyOrderItemRow[];
  /** Liste rozet/adım etiketi teslim şekline göre uyarlanır (sellerShipsGoods). */
  deliveryTerm?: string | null;
  /** Liste kartı ödeme planı özeti için. */
  paymentCategory?: string | null;
  paymentDays?: number | null;
  advancePercent?: number | null;
}

/** Karşı tarafın kurumsal özeti (sipariş detayında gösterilir). */
export interface CounterpartyProfile {
  city: string | null;
  industry: string | null;
  email: string | null;
  phone: string | null;
  rothernId: string | null;
}

/** Teslimat adresi snapshot'ı (award anında: ALIM→ilan, SATIS→kazanan teklif). */
export interface OrderDeliveryAddress {
  title: string;
  contactName: string | null;
  phone: string | null;
  country: string;
  city: string | null;
  district: string | null;
  addressLine: string;
  postalCode: string | null;
}

export interface CompanyOrderDetail extends CompanyOrder {
  counterpartyProfile: CounterpartyProfile;
  paymentTiming: PaymentTiming;
  /** İlan sahibinin seçimi (award snapshot'ı) — true ise satıcı onaydan önce
   *  teminat mektubu yüklemek zorunda. Teminat tetiği artık BU bayraktır. */
  requireGuaranteeLetter: boolean;
  paymentOpen: boolean;
  paymentTotals: { confirmed: string; pending: string; remaining: string };
  payments: OrderPayment[];
  items: CompanyOrderItemRow[];
  deliveryAddress?: OrderDeliveryAddress | null;
  /** Ödeme planı + teslim şekli — award anındaki SNAPSHOT (ilan silinse de
   *  kalır; Faz 3 adım motorunun kaynağı). Teminat tetiği bu DEĞİL,
   *  `requireGuaranteeLetter` bayrağıdır. */
  paymentCategory?: string | null;
  advancePercent?: number | null;
  paymentDays?: number | null;
  lcType?: string | null;
  lcConfirmed?: boolean;
  paymentNote?: string | null;
  deliveryTerm?: string | null;
  /** Gönderim öncesi onaylanması gereken peşin tutar (S3); "0.00" = şart yok. */
  advanceDue?: string | null;
  /** Vade tarihi (Vadeli/Çek/kısmi-peşin kalanı) — teslim + gün; ISO/null. */
  paymentDueDate?: string | null;
  /** Akreditif adım damgaları (Faz 3). */
  lcOpenedAt?: string | null;
  lcAcceptedAt?: string | null;
  lcPaidAt?: string | null;
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
  // A1 — satıcı iptal talebi + ihtilaf. Açık talep = status ACCEPTED && cancelRequestedAt.
  cancelRequestedAt?: string | null;
  cancelRequestReason?: string | null;
  cancelRequestById?: string | null;
  disputedAt?: string | null;
  // TTK 23 — ayıp ihbarı. Ayıp-DISPUTED = status DISPUTED && defectNotifiedAt.
  defectNotifiedAt?: string | null;
  defectReason?: string | null;
  disputePrevStatus?: CompanyOrderStatus | null;
  defectNoticeWindowDays?: number;
}

export interface AcceptOrderInput {
  /** Kabulde tarih SORULMAZ — teslim bilgisi tekliften gelir (backend türetir). */
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

/** Satıcı: siparişi gönder (fatura no zorunlu + gönderim notu). */
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

/** A1 — Satıcı: iptal talebi aç (gerekçe zorunlu, min 10). */
export function useRequestCancel(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (reason: string) => {
      const { data } = await companyApi.post(
        `/company/orders/${id}/cancel-request`,
        { reason },
      );
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["company-orders"] }),
  });
}

/** A1 — Satıcı: açık iptal talebini geri çek. */
export function useWithdrawCancelRequest(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data } = await companyApi.post(
        `/company/orders/${id}/cancel-request/withdraw`,
        {},
      );
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["company-orders"] }),
  });
}

/** A1 — Alıcı iptal talebi kararı: approve (→CANCELLED) | reject (→DISPUTED). */
export function useCancelRequestDecision(
  id: string,
  action: "approve" | "reject",
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input?: { note?: string }) => {
      const { data } = await companyApi.post(
        `/company/orders/${id}/cancel-request/${action}`,
        action === "reject" ? { note: input?.note } : {},
      );
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["company-orders"] }),
  });
}

/** TTK 23 — Alıcı: ayıp ihbarı aç (gerekçe zorunlu, min 10) → DISPUTED. */
export function useRaiseDefectNotice(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (reason: string) => {
      const { data } = await companyApi.post(
        `/company/orders/${id}/defect-notice`,
        { reason },
      );
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["company-orders"] }),
  });
}

/** TTK 23 — Alıcı: ayıp ihbarını geri çek → önceki durumuna döner. */
export function useWithdrawDefectNotice(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data } = await companyApi.post(
        `/company/orders/${id}/defect-notice/withdraw`,
        {},
      );
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["company-orders"] }),
  });
}

/** Akreditif adımı — action: opened (alıcı) | accept (satıcı) | paid (satıcı). */
export function useLcStep(id: string, action: "opened" | "accept" | "paid") {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data } = await companyApi.post(
        `/company/orders/${id}/lc/${action}`,
        {},
      );
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["company-orders"] }),
  });
}

// Revizyon müzakeresi hook'ları kaldırıldı (2026-08-02) — özellik söküldü.

/** Sipariş değerlendirmem (varsa). */
export function useOrderReview(orderId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["company-orders", "review", orderId],
    enabled,
    queryFn: async () => {
      const { data } = await companyApi.get<{
        rating: number;
        comment: string | null;
        showName?: boolean;
      } | null>(`/company/reviews/order/${orderId}`);
      return data;
    },
  });
}

/** Tedarikçiyi değerlendir (1-5 + yorum). */
export function useUpsertReview(orderId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { rating: number; comment?: string; showName?: boolean }) => {
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
    onSuccess: () => {
      // Denetim 2026-08-26 Parça 10: yalnız DETAY tazeleniyordu; liste
      // `paymentSettled`/`paymentDueDate` ile rozet ve KPI basıyor → önek
      // invalidasyonu (dosyadaki diğer sipariş mutasyonlarının deseni).
      qc.invalidateQueries({ queryKey: ["company-orders"] });
      qc.invalidateQueries({ queryKey: ["company-dashboard"] });
    },
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
    onSuccess: () => {
      // Denetim 2026-08-26 Parça 10: yalnız DETAY tazeleniyordu; liste
      // `paymentSettled`/`paymentDueDate` ile rozet ve KPI basıyor → önek
      // invalidasyonu (dosyadaki diğer sipariş mutasyonlarının deseni).
      qc.invalidateQueries({ queryKey: ["company-orders"] });
      qc.invalidateQueries({ queryKey: ["company-dashboard"] });
    },
  });
}
