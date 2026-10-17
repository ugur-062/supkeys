import { isOrderRejectedReason } from "@rothern/shared";

/**
 * LOST teklifin GERÇEK sonucu (arayüz testi D-102/D-117). Sunucu ayrı
 * olayları aynı `LOST` durumuyla saklar:
 *   - satıcı kazandığı siparişi reddetti → `eliminatedAt` + `[[ORDER_REJECTED]]`
 *     gerekçe (sunucu `orderRejected` bayrağı) → "orderRejected"
 *   - alıcı teklifi eledi            → `eliminatedAt` dolu  → "eliminated"
 *   - talep başka teklife kazandırıldı → AWARDED            → "lost"
 *   - talep iptal edildi              → CANCELLED          → "cancelled"
 *   - kazanansız kapandı / tur taşıması (NONE) → diğerleri → "closed"
 * "Elendi" yalnız alıcının elemesinde gösterilir; sipariş reddi de
 * `eliminatedAt` damgaladığı için önce o ayrılır (arayüz testi son tur).
 */
export type LostBidOutcome = "orderRejected" | "eliminated" | "lost" | "cancelled" | "closed";

export function lostBidOutcome(
  bid: {
    eliminatedAt?: string | null;
    eliminationReason?: string | null;
    orderRejected?: boolean | null;
  },
  listingStatus: string,
): LostBidOutcome {
  if (bid.orderRejected || isOrderRejectedReason(bid.eliminationReason)) return "orderRejected";
  if (bid.eliminatedAt) return "eliminated";
  if (listingStatus === "AWARDED") return "lost";
  if (listingStatus === "CANCELLED") return "cancelled";
  return "closed";
}
