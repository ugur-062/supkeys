/**
 * LOST teklifin GERÇEK sonucu (arayüz testi D-102/D-117). Sunucu üç ayrı
 * olayı aynı `LOST` durumuyla saklar:
 *   - alıcı teklifi eledi            → `eliminatedAt` dolu  → "eliminated"
 *   - talep başka teklife kazandırıldı → AWARDED            → "lost"
 *   - talep iptal edildi              → CANCELLED          → "cancelled"
 *   - kazanansız kapandı / tur taşıması (NONE) → diğerleri → "closed"
 * "Elendi" yalnız ilkinde gösterilir; eskiden her LOST "Elendi" diyordu.
 */
export type LostBidOutcome = "eliminated" | "lost" | "cancelled" | "closed";

export function lostBidOutcome(
  bid: { eliminatedAt?: string | null },
  listingStatus: string,
): LostBidOutcome {
  if (bid.eliminatedAt) return "eliminated";
  if (listingStatus === "AWARDED") return "lost";
  if (listingStatus === "CANCELLED") return "cancelled";
  return "closed";
}
