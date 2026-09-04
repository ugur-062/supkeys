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
 * `/talep/<slug>` sayfasının çözümleyicisi. (Eskiden `/ilan/<slug>` ile
 * ortaktı; satış ilanı 2026-09-04'te kaldırıldı.)
 *
 *  1. Slug'dan numarayı çıkar; numara yoksa 404 (arama motoru uydurduğu bir
 *     yolu denerse boş sayfa değil net bir 404 görsün).
 *  2. SLUG kontrolü: başlık değişince eski slug hâlâ çalışır (numara sabit)
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

  const canonical = listingPath(listing.number, listing.title);
  if (listing.type !== expected) return { kind: "redirect", to: canonical };
  if (canonical !== `/talep/${slug}`) {
    return { kind: "redirect", to: canonical };
  }
  return { kind: "ok", listing };
}
