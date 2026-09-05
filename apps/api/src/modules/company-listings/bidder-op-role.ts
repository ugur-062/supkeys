import type { ListingType } from "@rothern/db";

/**
 * Teklif-yanı işlem İZNİ — TEK KAYNAK (INV-SM benzeri drift önlemi):
 * ALIM talebine teklif veren SATAR → `sell:bid:submit`. placeBid /
 * extendBidValidity / teklif-belgeleri aynı kuralı buradan okur (Faz R: SAHIP
 * muafiyeti yok; 2026-09-05: rol adı yerine izin anahtarı).
 */
export const BIDDER_PERMISSION = "sell:bid:submit";

export function bidderPermission(listingType: ListingType): string {
  void listingType; // tek yön (ALIM) — parametre çağıran imzası için duruyor
  return BIDDER_PERMISSION;
}
