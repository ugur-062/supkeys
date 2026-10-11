/**
 * Sipariş kaleminin muadil / marka snapshot'ı (arayüz testi O-003).
 *
 * Award anında kalemin İSTENEN marka/MPN'i (ListingItem) ve kazanan teklif
 * kaleminin MUADİL beyanı (ListingBidItem) siparişe dondurulur: sipariş ve
 * yazdırma çıktısı uyuşmazlıkta bağlayıcı kayıttır, ilan/teklif sonradan
 * değişse ya da silinse de sipariş neyin satın alındığını bilir. İki
 * kazandırma yolu (toplu + kalem bazlı) bu TEK fonksiyonu kullanır.
 */
export interface OrderItemAlternativeSnapshot {
  requestedBrand: string | null;
  requestedMpn: string | null;
  isAlternative: boolean;
  offeredBrand: string | null;
  offeredMpn: string | null;
}

const clean = (v: string | null | undefined): string | null => v?.trim() || null;

export function orderItemAlternativeSnapshot(
  listingItem: { brand?: string | null; mpn?: string | null },
  bidItem: {
    isAlternative?: boolean | null;
    offeredBrand?: string | null;
    offeredMpn?: string | null;
  },
): OrderItemAlternativeSnapshot {
  const isAlternative = bidItem.isAlternative === true;
  return {
    requestedBrand: clean(listingItem.brand),
    requestedMpn: clean(listingItem.mpn),
    isAlternative,
    // Muadil değilse teklif edilen = istenen; ayrı alan yazılmaz.
    offeredBrand: isAlternative ? clean(bidItem.offeredBrand) : null,
    offeredMpn: isAlternative ? clean(bidItem.offeredMpn) : null,
  };
}
