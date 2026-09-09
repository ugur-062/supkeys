import { TR_PROVINCES } from "../data/tr-provinces";
import { slugifyText } from "./slug";

/**
 * HERKESE AÇIK ADRES ŞEMASI — TEK KAYNAK (2026-09-09, SEO Parça 5).
 *
 * Aynı adresi ÜÇ taraf üretir: web sayfası (kanonik etiket), sitemap ve
 * artık API (yayın anında arama motorlarına bildirim — IndexNow + web
 * önbellek tazeleme). Üçü ayrı yerde kurulsaydı biri gün gelir ayrışır ve
 * motor "sitemap'teki adres ≠ sayfanın kanoniği" görüp ikisine de
 * güvenmezdi. Web `lib/public/marketplace.ts` ve `lib/public/city.ts` bu
 * fonksiyonları YENİDEN DIŞA AKTARIR; kendi kopyasını taşımaz.
 *
 * Kural (CLAUDE.md § Slug kuralı): kod/numara ÖNDE — ayrıştırma tek regex.
 */

export const PUBLIC_PATHS = {
  products: "/urunler",
  companies: "/firmalar",
  demands: "/alim-talepleri",
  demand: "/talep",
  company: "/firma",
} as const;

/* ------------------------------------------------------------------ */
/* Alım talebi — numara önde                                            */
/* ------------------------------------------------------------------ */

const LISTING_NUMBER_RE = /^(rot-\d+)(?:-|$)/i;

export function listingSlug(number: string, title: string): string {
  const head = slugifyText(number);
  const tail = slugifyText(title);
  // Başlık tamamen alfanümerik-dışıysa (emoji vb.) yalnız numara kalır —
  // geçerli bir URL üretmek başlığı korumaktan önemli.
  return tail ? `${head}-${tail}` : head;
}

/** Slug parçasından ilan numarasını çıkarır (`ROT-000042`). Yoksa null. */
export function parseListingNumber(slug: string): string | null {
  const m = LISTING_NUMBER_RE.exec(slug.trim());
  return m ? m[1].toUpperCase() : null;
}

export function listingPath(number: string, title: string): string {
  return `${PUBLIC_PATHS.demand}/${listingSlug(number, title)}`;
}

/* ------------------------------------------------------------------ */
/* Kategori — 8 haneli kod önde                                         */
/* ------------------------------------------------------------------ */

const CATEGORY_CODE_RE = /^(\d{8})(?:-|$)/;

export function categoryPath(code: string, name?: string): string {
  const tail = name ? slugifyText(name) : "";
  const slug = tail ? `${code}-${tail}` : code;
  return `${PUBLIC_PATHS.products}/kategori/${slug}`;
}

/** Yol parçasından kategori kodunu çıkarır. Geçersizse null. */
export function parseCategoryCode(slug: string): string | null {
  const m = CATEGORY_CODE_RE.exec(slug.trim());
  return m ? m[1] : null;
}

/** 8 haneli koddan SEGMENT (L1) kodu — kategori sayfaları segment düzeyinde. */
export function segmentCodeOf(code: string | null | undefined): string | null {
  return code && code.length === 8 ? `${code.slice(0, 2)}000000` : null;
}

/* ------------------------------------------------------------------ */
/* Firma ve ürün                                                        */
/* ------------------------------------------------------------------ */

export function companyPath(companySlug: string): string {
  return `${PUBLIC_PATHS.company}/${companySlug}`;
}

/** Ürün FİRMANIN ALTINDA yaşar; slug firma içinde tekil. */
export function productPath(companySlug: string, productSlug: string): string {
  return `${companyPath(companySlug)}/urun/${productSlug}`;
}

/* ------------------------------------------------------------------ */
/* Şehir — kod YOK, il adları tekil (bkz. web city.test.ts)             */
/* ------------------------------------------------------------------ */

export function citySlug(name: string): string {
  return slugifyText(name);
}

/** Yalnız TANINAN il için yol; serbest metin şehir sayfa üretmez. */
export function knownCityName(name: string | null | undefined): string | null {
  if (!name) return null;
  const s = citySlug(name.trim());
  return TR_PROVINCES.find((p) => citySlug(p.name) === s)?.name ?? null;
}

export const cityProductPath = (name: string) => `${PUBLIC_PATHS.products}/sehir/${citySlug(name)}`;
export const cityCompanyPath = (name: string) => `${PUBLIC_PATHS.companies}/sehir/${citySlug(name)}`;
