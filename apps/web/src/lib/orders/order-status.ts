import type { StatusTone } from "@/components/ui/status-badge";
import type { CompanyOrderStatus } from "@/hooks/use-company-orders";

/**
 * P2 (frontend denetimi §8.3) — sipariş durumunun TEK yazımı. Liste ile
 * detay farklı etiket gösteriyordu ("Teslim Alındı" vs "Ödeme bekleniyor",
 * "İptal Edildi" vs "İptal") — durum rozeti nereden bakılırsa bakılsın
 * buradan gelir; ödeme durumu AYRI iletişimdir (yaşam döngüsü ayrımı).
 *
 * i18n Faz 2: TON burada, METİN katalogda (`web.domain.orderStatus.<KOD>`);
 * okuma `@/i18n/domain` `useOrderStatusLabel`.
 */
export const ORDER_STATUS: Record<CompanyOrderStatus, { tone: StatusTone }> = {
  PENDING: { tone: "pending" },
  ACCEPTED: { tone: "active" },
  CREATED: { tone: "neutral" },
  IN_DELIVERY: { tone: "active" },
  DELIVERED: { tone: "active" },
  COMPLETED: { tone: "done" },
  REJECTED: { tone: "failed" },
  CANCELLED: { tone: "neutral" },
  DISPUTED: { tone: "pending" },
};

/** Durum rozetinin KATALOG anahtarı (`web.domain.orderStatus.<KOD>`). */
export type OrderStatusLabelKey = CompanyOrderStatus | "IN_DELIVERY_PICKUP";

export type OrderStepKey = "APPROVAL" | "SHIP" | "DELIVERY" | "COMPLETE";

/**
 * Süreç izleyicisi — 4 KİLOMETRE TAŞI (2026-09-10, kullanıcı kararı).
 *
 * Eskiden 5 adım DURUM adı taşıyordu ("Onay Bekliyor" → "Onaylandı" →
 * "Gönderildi" → "Teslim Alındı" → "Tamamlandı"): "Onay Bekliyor" ile
 * "Onaylandı" aynı olayın iki hâliydi ve izleyici, yanındaki durum rozetini
 * tekrar ediyordu. İzleyici artık OLAYLARI listeler; hangi olayın sürdüğünü
 * `orderStageIndex` söyler, durumun adı rozette kalır.
 * Liste kartı ve detay izleyicisi AYNI diziden okur. Orta adım teslim şekline
 * duyarlı: satıcı taşımıyorsa (EXW…) "Hazırlık" — i18n Faz 2'de adım METNİ
 * katalogda (`web.domain.orderStep.<KOD>`, SHIP_PICKUP = "Hazırlık"), burada
 * yalnız adım anahtarları ve sıraları var.
 */
export function orderSteps(sellerShips: boolean): {
  key: OrderStepKey;
  /** Katalog anahtarı — SHIP, satıcı taşımıyorsa SHIP_PICKUP'a düşer. */
  labelKey: string;
}[] {
  return [
    { key: "APPROVAL", labelKey: "APPROVAL" },
    { key: "SHIP", labelKey: sellerShips ? "SHIP" : "SHIP_PICKUP" },
    { key: "DELIVERY", labelKey: "DELIVERY" },
    { key: "COMPLETE", labelKey: "COMPLETE" },
  ];
}

/**
 * Durum → izleyici konumu. `done` = biten adım sayısı, `current` = süren
 * adımın indeksi (hepsi bittiyse ve iptal/redde -1). Legacy CREATED,
 * ACCEPTED hizasında.
 */
export function orderStageIndex(status: CompanyOrderStatus): {
  done: number;
  current: number;
  terminated: boolean;
} {
  switch (status) {
    case "PENDING":
      return { done: 0, current: 0, terminated: false };
    case "ACCEPTED":
    case "CREATED":
      return { done: 1, current: 1, terminated: false };
    case "IN_DELIVERY":
      return { done: 2, current: 2, terminated: false };
    case "DELIVERED":
      return { done: 3, current: 3, terminated: false };
    case "COMPLETED":
      return { done: 4, current: -1, terminated: false };
    case "REJECTED":
    case "CANCELLED":
    case "DISPUTED":
      return { done: 0, current: -1, terminated: true };
    default:
      return { done: 0, current: 0, terminated: false };
  }
}

/**
 * Durum rozetinin anahtarı + tonu. IN_DELIVERY teslim şekline duyarlı: satıcı
 * taşımıyorsa alıcı toplar (`IN_DELIVERY_PICKUP` — "Teslime Hazır").
 */
export function orderStatusMeta(
  status: CompanyOrderStatus,
  sellerShips = true,
): { labelKey: OrderStatusLabelKey; tone: StatusTone } {
  const base = ORDER_STATUS[status] ?? ORDER_STATUS.CREATED;
  const labelKey: OrderStatusLabelKey =
    status === "IN_DELIVERY" && !sellerShips ? "IN_DELIVERY_PICKUP" : status;
  return { labelKey, tone: base.tone };
}
