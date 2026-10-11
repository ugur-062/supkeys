import { visibleCategoryIds } from "@rothern/shared";
import {
  listingHref,
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

  const canonical = listingHref(listing);
  if (listing.type !== expected) return { kind: "redirect", to: canonical };
  if (canonical !== `/talep/${slug}`) {
    return { kind: "redirect", to: canonical };
  }
  return { kind: "ok", listing };
}

/**
 * "Benzer açık talepler" bloğunun süzüleceği SEGMENT (L1) — talebin ilk
 * GÖRÜNÜR kategori kodundan; yoksa `null` (blok hiç çizilmez).
 *
 * Gizli segment (2026-10-09): gizli kod liste sorgusunda "kategori süzgeci
 * verilmemiş" sayılır (API kuralı), yani gizli segmentteki eski talebin
 * sayfasında blok ilgisiz en yeni talepleri "benzer" diye gösterirdi — ve
 * sorgu adresinde gizli kod dolaşırdı. Görünür kategorisi olmayan talepte
 * benzerlik ölçütü yoktur; uydurmak yerine blok açılmaz.
 */
export function similarListingsSegment(categoryIds: readonly string[] | null | undefined): string | null {
  const code = visibleCategoryIds(categoryIds).find((c) => /^\d{8}$/.test(c));
  return code ? `${code.slice(0, 2)}000000` : null;
}
