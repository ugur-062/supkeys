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
