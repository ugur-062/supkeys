import type {
  OrderPayment,
  OrderStatus,
  PaymentTiming,
} from "@/lib/tenders/types";

/**
 * Faz 3 madde 16 — Ödeme kaydı oluşturulabilir mi?
 * Backend `OrderPaymentsService.isPaymentOpen` ile birebir aynı mantık.
 *  - BEFORE_DELIVERY: tedarikçi onayından sonra (ACCEPTED, IN_DELIVERY, COMPLETED)
 *  - AFTER_DELIVERY:  alıcı teslim aldıktan sonra (DELIVERED)
 */
export function isPaymentOpen(
  timing: PaymentTiming,
  status: OrderStatus,
): boolean {
  if (timing === "BEFORE_DELIVERY") {
    return (
      status === "ACCEPTED" ||
      status === "IN_DELIVERY" ||
      status === "COMPLETED"
    );
  }
  return status === "DELIVERED";
}

/** Henüz ödeme açılmamışsa alıcıya gösterilecek bilgi metni. */
export function paymentClosedReason(timing: PaymentTiming): string {
  return timing === "AFTER_DELIVERY"
    ? "Ödeme bölümü, siparişi teslim aldıktan sonra açılır."
    : "Ödeme kaydı tedarikçi siparişi onayladıktan sonra eklenebilir.";
}

export interface PaymentTotals {
  /** Onaylanmış toplam. */
  confirmed: number;
  /** Tedarikçi onayı bekleyen toplam. */
  pending: number;
  /** Sipariş tutarından (bekleyen + onaylı) düşülen kalan. */
  remaining: number;
}

/** Reddedilenler hariç toplamlar + kalan ödenecek tutar. */
export function computePaymentTotals(
  payments: OrderPayment[],
  orderTotal: string | number,
): PaymentTotals {
  let confirmed = 0;
  let pending = 0;
  for (const p of payments) {
    const amount = Number(p.amount);
    if (p.status === "CONFIRMED") confirmed += amount;
    else if (p.status === "AWAITING_CONFIRMATION") pending += amount;
  }
  const total = Number(orderTotal);
  const remaining = Math.max(0, total - confirmed - pending);
  return { confirmed, pending, remaining };
}
