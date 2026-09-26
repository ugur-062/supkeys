import { MARKETPLACE_ROUTES, categoryHref, listingHref } from "@/lib/public/marketplace";
import {
  fetchCompanySitemap,
  fetchListingSitemap,
  fetchProductSitemap,
  fetchSitemapSummary,
  type SitemapSummary,
} from "@/lib/public/marketplace-api";
import { allCitySlugs, cityProductPath } from "@/lib/public/city";
import { DEFAULT_LOCALE, LOCALES, type Locale } from "@rothern/i18n";
import { localizePath } from "@/i18n/href";
import { absoluteUrl } from "@/lib/seo/meta";
import type { SitemapIndexItem, SitemapUrl } from "@/lib/seo/sitemap-xml";

/**
 * SİTEMAP PARÇALARI — hangi adres hangi dosyada (SEO Parça 5).
 *
 *   /sitemap.xml                → indeks (aşağıdakilerin listesi)
 *   /sitemaps/pages.xml         → anasayfa, dizinler, kurumsal/yasal
 *   /sitemaps/categories.xml    → ürünü olan segment sayfaları
 *   /sitemaps/cities.xml        → verisi olan il sayfaları (ürün + firma)
 *   /sitemaps/products[-N].xml  → ürünler (20.000/parça, görselli)
 *   /sitemaps/companies[-N].xml → firma profilleri
 *   /sitemaps/listings[-N].xml  → yalnız DİZİNLENEBİLİR alım talepleri
 *
 * KURAL: buraya YALNIZ dizinlenebilir URL girer. İlan tarafında bunu backend
 * belirler (`marketplaceIndexableWhere`); kapanmış ilan sitede durur ama
 * sitemap'te yer almaz ve `noindex` alır. Kategori/şehir yalnız VERİSİ OLAN
 * — boş sayfa "ince içerik" sinyalidir.
 *
 * Adresler sayfanın kanonik etiketiyle AYNI fonksiyondan üretilir
 * (`listingPath`, `categoryPath`, `cityProductPath` — `@rothern/shared`).
 * `lastmod` UYDURULMAZ: kümede gerçek en yeni `updatedAt` (API summary).
 *
 * DİLLER (i18n SEO 2026-09-26): her dil sürümü KENDİ `<url>` girdisidir
 * (Google: "her dil için ayrı <url>, her birinde tam hreflang seti"). Eskiden
 * yalnız Türkçe adres `<loc>`tu, EN/RU yalnız alternatifti. Ürün/talep/firma
 * yalnız HAZIR dillerinde listelenir (API `locales` — sayfanın `noindex`iyle
 * aynı kural): çevirisi gelmemiş dil ne girdi ne alternatif olur.
 */

/**
 * API sayfa boyutu ile AYNI (`SITEMAP_PAGE_SIZE`) — parça sayısı bundan türer.
 * Kayıt başına dil sayısı kadar URL: 5.000 × 3 = 15.000 (sınır 50.000).
 */
export const PART_PAGE_SIZE = 5_000;

const PART_RE = /^(pages|categories|cities|products|companies|listings)(?:-(\d+))?$/;

export interface PartName {
  kind: "pages" | "categories" | "cities" | "products" | "companies" | "listings";
  page: number;
}

export function parsePartName(name: string): PartName | null {
  const m = PART_RE.exec(name);
  if (!m) return null;
  const page = m[2] ? Number(m[2]) : 0;
  if (!Number.isInteger(page) || page < 0 || page > 50) return null;
  return { kind: m[1] as PartName["kind"], page };
}

export function partPath(kind: PartName["kind"], page = 0): string {
  return `/sitemaps/${kind}${page > 0 ? `-${page}` : ""}.xml`;
}

function pageCount(count: number): number {
  return Math.max(1, Math.ceil(count / PART_PAGE_SIZE));
}

/** İndeks: özet sayılarından parça listesi — her parça gerçek `lastmod`la. */
export function indexItems(summary: SitemapSummary): SitemapIndexItem[] {
  const items: SitemapIndexItem[] = [{ loc: absoluteUrl(partPath("pages")), lastmod: null }];
  const catLast = maxIso(summary.categories.map((c) => c.lastmod));
  items.push({ loc: absoluteUrl(partPath("categories")), lastmod: catLast });
  const cityLast = maxIso([...summary.productCities, ...summary.companyCities].map((c) => c.lastmod));
  items.push({ loc: absoluteUrl(partPath("cities")), lastmod: cityLast });
  for (const kind of ["products", "companies", "listings"] as const) {
    const bucket = summary[kind];
    for (let p = 0; p < pageCount(bucket.count); p++) {
      items.push({ loc: absoluteUrl(partPath(kind, p)), lastmod: bucket.lastmod });
    }
  }
  return items;
}

function maxIso(values: (string | null | undefined)[]): string | null {
  let best: string | null = null;
  for (const v of values) if (v && (!best || v > best)) best = v;
  return best;
}

/* ------------------------------------------------------------------ */
/* Parçalar                                                            */
/* ------------------------------------------------------------------ */

const STATIC_PAGES: SitemapUrl[] = [
  { loc: "/", changefreq: "hourly", priority: 1.0 },
  { loc: MARKETPLACE_ROUTES.products, changefreq: "daily", priority: 0.9 },
  { loc: MARKETPLACE_ROUTES.demands, changefreq: "hourly", priority: 0.9 },
  { loc: MARKETPLACE_ROUTES.companies, changefreq: "daily", priority: 0.8 },
  { loc: "/nasil-calisir", changefreq: "monthly", priority: 0.6 },
  // SSS: üretken motorların en çok alıntıladığı sayfa tipi.
  { loc: "/sss", changefreq: "monthly", priority: 0.6 },
  { loc: "/hakkimizda", changefreq: "monthly", priority: 0.5 },
  { loc: "/iletisim", changefreq: "monthly", priority: 0.4 },
  ...[
    "/sozlesmeler/kullanici",
    "/sozlesmeler/aracilik",
    "/sozlesmeler/gizlilik",
    "/sozlesmeler/kvkk",
    "/sozlesmeler/mesafeli-satis",
    "/sozlesmeler/iade",
  ].map((loc) => ({ loc, changefreq: "yearly" as const, priority: 0.3 })),
];

/**
 * Göreli (Türkçe, ön eksiz) iç yol → HER dil için bir girdi; her girdide aynı
 * hreflang seti (+ `x-default` Türkçe). `locales` verilmezse tüm diller.
 * Türkçe yoksa (kaynak dili başka ve Türkçe çevirisi gelmemiş) `x-default`
 * yazılmaz — var olmayan sayfayı varsayılan göstermeyelim.
 */
export function located(
  path: string,
  extra: Omit<SitemapUrl, "loc" | "alternates">,
  locales: readonly Locale[] = LOCALES,
): SitemapUrl[] {
  const langs = LOCALES.filter((l) => locales.includes(l));
  if (langs.length === 0) return [];
  const alternates: Record<string, string> = {};
  for (const l of langs) alternates[l] = absoluteUrl(localizePath(path, l));
  if (langs.includes(DEFAULT_LOCALE)) alternates["x-default"] = alternates[DEFAULT_LOCALE]!;
  return langs.map((l) => ({ ...extra, loc: alternates[l]!, alternates }));
}

/** API eski sürümdeyse (`locales` yok) tüm diller — dağıtım sırasından bağımsız. */
function localesOf(row: { locales?: string[] }): Locale[] {
  return Array.isArray(row.locales) ? LOCALES.filter((l) => row.locales!.includes(l)) : [...LOCALES];
}

export async function buildPart(part: PartName): Promise<SitemapUrl[]> {
  switch (part.kind) {
    case "pages":
      return STATIC_PAGES.flatMap(({ loc, ...rest }) => located(loc, rest));
    case "categories": {
      const s = await fetchSitemapSummary();
      return s.categories
        .filter((c) => c.count > 0)
        .flatMap((c) => located(categoryHref(c), { lastmod: c.lastmod, changefreq: "daily", priority: 0.8 }));
    }
    case "cities": {
      const s = await fetchSitemapSummary();
      const known = new Set(allCitySlugs().map((c) => c.name));
      return [
        ...s.productCities
          .filter((c) => c.count > 0 && known.has(c.city))
          .flatMap((c) => located(cityProductPath(c.city), { lastmod: c.lastmod, changefreq: "daily", priority: 0.7 })),
        // Firma şehir sayfaları YOK (2026-09-22): dizin liste değil, üyeliğe
        // yönlendiren vitrin; `/firmalar/sehir/<il>` → `/firmalar` 308.
      ];
    }
    case "products": {
      const rows = await fetchProductSitemap(part.page);
      // Ürün: firmanın altında yaşayan KALICI içerik — vitrinin asıl
      // indekslenecek gövdesi. Görseller image sitemap uzantısıyla.
      return rows.flatMap((p) =>
        located(
          `/firma/${p.companySlug}/urun/${p.slug}`,
          {
            lastmod: p.updatedAt,
            changefreq: "weekly",
            priority: 0.7,
            images: (p.images ?? []).filter((i) => /^https?:\/\//.test(i)).map((i) => ({ loc: i, title: p.name })),
          },
          localesOf(p),
        ),
      );
    }
    case "companies": {
      const rows = await fetchCompanySitemap(part.page);
      return rows.flatMap((c) =>
        located(`/firma/${c.slug}`, { lastmod: c.updatedAt, changefreq: "weekly", priority: 0.8 }, localesOf(c)),
      );
    }
    case "listings": {
      const rows = await fetchListingSitemap(part.page);
      return rows.flatMap((l) =>
        located(listingHref(l), { lastmod: l.updatedAt, changefreq: "daily", priority: 0.7 }, localesOf(l)),
      );
    }
  }
}
