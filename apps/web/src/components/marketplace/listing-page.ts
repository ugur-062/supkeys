import {
  listingPath,
  parseListingNumber,
  type PublicListingType,
} from "@/lib/public/marketplace";
import {
  fetchListing,
  type PublicListingDetail,
} from "@/lib/public/marketplace-api";

/**
 * `/talep/<slug>` ve `/ilan/<slug>` sayfalarının ORTAK çözümleyicisi.
 *
 * Üç kararı tek yerde verir ki iki rota ayrışmasın:
 *
 *  1. Slug'dan numarayı çıkar; numara yoksa 404 (arama motoru uydurduğu bir
 *     yolu denerse boş sayfa değil net bir 404 görsün).
 *  2. TİP kontrolü: `/ilan/` altında bir ALIM kaydı istenirse doğru tabana
 *     KALICI yönlendir. Aksi hâlde aynı içerik iki adreste yaşar ve arama
 *     motoru hangisinin kanonik olduğunu bilemez.
 *  3. SLUG kontrolü: başlık değişince eski slug hâlâ çalışır (numara sabit)
 *     ama kanonik adrese kalıcı yönlendirilir — gelen bağlantı kırılmaz,
 *     indekste tek adres kalır.
 */
export type Resolution =
  | { kind: "notFound" }
  | { kind: "redirect"; to: string }
  | { kind: "ok"; listing: PublicListingDetail };

export async function resolveListingPage(
  slug: string,
  expected: PublicListingType,
): Promise<Resolution> {
  const number = parseListingNumber(slug);
  if (!number) return { kind: "notFound" };

  const listing = await fetchListing(number);
  if (!listing) return { kind: "notFound" };

  const canonical = listingPath(listing.type, listing.number, listing.title);
  if (listing.type !== expected) return { kind: "redirect", to: canonical };
  if (canonical !== `/${expected === "ALIM" ? "talep" : "ilan"}/${slug}`) {
    return { kind: "redirect", to: canonical };
  }
  return { kind: "ok", listing };
}
