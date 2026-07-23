import { CompanyRole, type ListingType } from "@rothern/db";

/**
 * Teklif-yanı işlem rolü — TEK KAYNAK (INV-SM benzeri drift önlemi):
 * ALIM ilanına teklif veren SATAR → Satışçı; SATIS ilanına teklif veren
 * ALIR → Satın Almacı. placeBid / extendBidValidity / teklif-belgeleri
 * aynı kuralı buradan okur (Faz R: SAHIP muafiyeti yok).
 */
export function bidderOpRole(listingType: ListingType): CompanyRole {
  return listingType === "ALIM"
    ? CompanyRole.SATISCI
    : CompanyRole.SATIN_ALMACI;
}
