import type { StatusTone } from "@/components/ui/status-badge";
import type { CompanyOrderStatus } from "@/hooks/use-company-orders";

/**
 * P2 (frontend denetimi §8.3) — sipariş durumunun TEK yazımı. Liste ile
 * detay farklı etiket gösteriyordu ("Teslim Alındı" vs "Ödeme bekleniyor",
 * "İptal Edildi" vs "İptal") — durum rozeti nereden bakılırsa bakılsın
 * buradan gelir; ödeme durumu AYRI iletişimdir (yaşam döngüsü ayrımı).
 */
export const ORDER_STATUS: Record<
  CompanyOrderStatus,
  { label: string; tone: StatusTone }
> = {
  PENDING: { label: "Onay Bekliyor", tone: "pending" },
  ACCEPTED: { label: "Onaylandı", tone: "active" },
  CREATED: { label: "Yeni", tone: "neutral" },
  IN_DELIVERY: { label: "Gönderildi", tone: "active" },
  DELIVERED: { label: "Teslim Alındı", tone: "active" },
  COMPLETED: { label: "Tamamlandı", tone: "done" },
  REJECTED: { label: "Reddedildi", tone: "failed" },
  CANCELLED: { label: "İptal Edildi", tone: "neutral" },
  DISPUTED: { label: "İhtilaflı", tone: "pending" },
};

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
 * duyarlı: satıcı taşımıyorsa (EXW…) "Hazırlık".
 */
export function orderSteps(sellerShips: boolean): {
  key: OrderStepKey;
  label: string;
}[] {
  return [
    { key: "APPROVAL", label: "Onay" },
    { key: "SHIP", label: sellerShips ? "Gönderim" : "Hazırlık" },
    { key: "DELIVERY", label: "Teslim" },
    { key: "COMPLETE", label: "Tamamlandı" },
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

/** IN_DELIVERY etiketi teslim şekline duyarlı: satıcı taşımıyorsa alıcı toplar. */
export function orderStatusMeta(
  status: CompanyOrderStatus,
  sellerShips = true,
): { label: string; tone: StatusTone } {
  const base = ORDER_STATUS[status] ?? ORDER_STATUS.CREATED;
  if (status === "IN_DELIVERY" && !sellerShips)
    return { ...base, label: "Teslime Hazır" };
  return base;
}
