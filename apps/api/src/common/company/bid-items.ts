import { Prisma } from "@rothern/db";

/**
 * "Fiyatlı kalem" = `unitPrice > 0` — TEK KAYNAK (S1 drift önleme). Kapalı-zarf
 * kapsam/sıralama tarafı (owner currentBest + public bestTotal), monotonluk
 * kıyası ve AWARDED_PARTIAL damgası HEP aynı tanımı kullanmalı; aksi halde
 * 0-fiyatlı satır içeren "tam" bir teklif bir yolda tam, diğerinde kısmi
 * sayılır (eskiden filtresiz `_count._all` → tam kazanan yanlışlıkla
 * AWARDED_PARTIAL damgalanıyordu).
 *
 * Prisma `where` fragment olarak paylaşılır (JS predicate değil) — her
 * `listingBidItem` sorgusuna spread edilir: `where: { ...PRICED_ITEM_WHERE }`
 * veya başka koşullarla birlikte `where: { bidId: {...}, ...PRICED_ITEM_WHERE }`.
 */
export const PRICED_ITEM_WHERE = {
  unitPrice: { gt: 0 },
} as const satisfies Prisma.ListingBidItemWhereInput;

/**
 * S2 — "tam kapsam" teklif kıyas filtresi — TEK KAYNAK. Kalemli ilanda
 * sıralamaya (owner currentBest + public bestTotal) yalnız TÜM kalemleri
 * fiyatlamış teklifler girer; kısmi teklifin düşük toplamı "en iyi" değildir
 * (elma-armut). Kalemsiz ilan (count 0) → herkes kıyaslanabilir.
 * (`bidItemCount` = fiyatlı kalem sayısı = PRICED_ITEM_WHERE ile sayılan.)
 * NOT: sıralamanın kendisi (FX-normalize + tie-break) `rankAuctionBids` servis
 * metodudur (this.auctionTryValue'ye bağlı, impure → serviste kalır); burada
 * yalnız kapsam predicate'i paylaşılır.
 */
export function bidCoversAllItems(
  bidItemCount: number,
  listingItemCount: number,
): boolean {
  return listingItemCount === 0 || bidItemCount >= listingItemCount;
}
