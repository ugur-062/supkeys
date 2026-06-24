/**
 * G5 madde 19/21 — Sipariş belge kategorileri.
 *
 * Tüm belgeleri tedarikçi yükler; alıcı yalnızca görüntüler/indirir.
 * Kategoriler siparişin statüsüne göre kademeli görünür.
 */
import type { AttachmentScope } from "@/lib/attachments/types";
import type { OrderStatus } from "@/lib/tenders/types";

export type OrderDocScope =
  | "ORDER_PROFORMA"
  | "ORDER_TECHNICAL"
  | "ORDER_INVOICE"
  | "ORDER_DELIVERY"
  | "ORDER_BILL_OF_LADING"
  | "ORDER_GUARANTEE_LETTER";

export interface OrderDocCategory {
  scope: Extract<AttachmentScope, OrderDocScope>;
  label: string;
  emptyText: string;
  hint: string;
  /** Bu kategorinin görüneceği sipariş statüleri. */
  statuses: OrderStatus[];
  /** Madde 33 — yalnızca nakit ödemeli siparişlerde görünür. */
  cashOnly?: boolean;
  /** Yalnızca yurtiçi siparişte (örn. irsaliye). */
  domesticOnly?: boolean;
  /** Yalnızca uluslararası siparişte (örn. konşimento). */
  intlOnly?: boolean;
}

// "baştan" görünenler — terminal statülerde de mevcut belgeler görünsün diye
// REJECTED/CANCELLED dahil tüm statüler.
const ALL_STATUSES: OrderStatus[] = [
  "PENDING",
  "ACCEPTED",
  "IN_DELIVERY",
  "COMPLETED",
  "REJECTED",
  "CANCELLED",
  "IN_PROGRESS",
  "DELIVERED",
];

export const ORDER_DOC_CATEGORIES: OrderDocCategory[] = [
  {
    scope: "ORDER_PROFORMA",
    label: "Proforma",
    emptyText: "Proforma yüklenmedi",
    hint: "Proforma fatura — PDF, Word, görsel (max 50 MB)",
    statuses: ALL_STATUSES,
  },
  {
    scope: "ORDER_TECHNICAL",
    label: "Teknik Doküman",
    emptyText: "Teknik doküman yüklenmedi",
    hint: "Teknik çizim/şartname — PDF, Word, Excel, görsel (max 50 MB)",
    statuses: ALL_STATUSES,
  },
  {
    scope: "ORDER_INVOICE",
    label: "Fatura",
    emptyText: "Fatura yüklenmedi",
    hint: "Fatura — PDF, görsel (max 50 MB)",
    statuses: ["ACCEPTED", "IN_DELIVERY", "COMPLETED", "DELIVERED"],
  },
  {
    // Yurtiçi — irsaliye/teslim belgesi.
    scope: "ORDER_DELIVERY",
    label: "Teslimat Evrakları",
    emptyText: "Teslimat evrakı yüklenmedi",
    hint: "Alıcı imzalı irsaliye/teslim belgesi — PDF, görsel (max 50 MB)",
    statuses: ["IN_DELIVERY", "COMPLETED", "DELIVERED"],
    domesticOnly: true,
  },
  {
    // Uluslararası — irsaliye yerine konşimento (bill of lading).
    scope: "ORDER_BILL_OF_LADING",
    label: "Konşimento",
    emptyText: "Konşimento yüklenmedi",
    hint: "Konşimento (bill of lading) — PDF, görsel (max 50 MB)",
    statuses: ["IN_DELIVERY", "COMPLETED", "DELIVERED"],
    intlOnly: true,
  },
  {
    // Madde 33 — nakit ödemeli siparişte tedarikçi onaydan önce yükler.
    scope: "ORDER_GUARANTEE_LETTER",
    label: "Teminat Mektubu",
    emptyText: "Teminat mektubu yüklenmedi",
    hint: "Banka teminat mektubu — PDF, görsel (max 50 MB). Nakit ödemeli siparişte onaydan önce zorunlu.",
    statuses: ALL_STATUSES,
    cashOnly: true,
  },
];

/** Verilen sipariş statüsünde görünmesi gereken belge kategorileri. */
export function visibleOrderDocCategories(
  status: OrderStatus,
  opts?: { cashPayment?: boolean; isInternational?: boolean },
): OrderDocCategory[] {
  const intl = opts?.isInternational === true;
  return ORDER_DOC_CATEGORIES.filter(
    (c) =>
      c.statuses.includes(status) &&
      (!c.cashOnly || opts?.cashPayment === true) &&
      // Yurtiçi (irsaliye) ↔ uluslararası (konşimento) ayrımı.
      !(c.domesticOnly && intl) &&
      !(c.intlOnly && !intl),
  );
}

/** Tedarikçi belge yükleyebilir mi? (Terminal statülerde salt-okunur.) */
export function canUploadOrderDocs(status: OrderStatus): boolean {
  return status !== "REJECTED" && status !== "CANCELLED";
}
