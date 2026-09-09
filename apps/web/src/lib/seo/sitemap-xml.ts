/**
 * SITEMAP XML ÜRETİCİ — elle (SEO Parça 5).
 *
 * Next'in `app/sitemap.ts` kolaylığı bırakıldı: tek dosya 50.000 URL'de
 * kırılır ve sitemap İNDEKSİ üretmez. Burada iki biçim var:
 *   · `sitemapIndexXml`  → `/sitemap.xml` (parçaların listesi + lastmod)
 *   · `urlsetXml`        → `/sitemaps/<parça>.xml` (URL'ler + görsel uzantısı)
 *
 * Görsel uzantısı (`image:image`) ürün fotoğraflarını Google Görseller'e
 * taşır; B2B'de "ürün adı + fotoğraf" araması doğrudan vitrine trafik getirir.
 * Her değer XML-kaçışlıdır — ürün adında `&` olması dosyayı bozmamalı.
 */

export interface SitemapImage {
  loc: string;
  /** Görsel başlığı — ürün adı; motorlar alt metin gibi kullanır. */
  title?: string;
}

export interface SitemapUrl {
  loc: string;
  /** ISO 8601. Uydurulmaz: gerçek `updatedAt` yoksa alan YAZILMAZ. */
  lastmod?: string | null;
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: number;
  images?: SitemapImage[];
}

export interface SitemapIndexItem {
  loc: string;
  lastmod?: string | null;
}

/** Dosya başına sınır — protokol 50.000; başlık+görselle boyut da düşünülerek. */
export const SITEMAP_URL_LIMIT = 50_000;

export function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Saniye hassasiyeti yeter; milisaniye gürültüsü `lastmod`u her okumada "değişmiş" gösterir. */
function isoDate(v: string | null | undefined): string | null {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function urlsetXml(urls: SitemapUrl[]): string {
  if (urls.length > SITEMAP_URL_LIMIT) {
    throw new Error(`Sitemap parçası ${urls.length} URL — sınır ${SITEMAP_URL_LIMIT}; parçayı böl`);
  }
  const hasImages = urls.some((u) => u.images?.length);
  const out: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"${
      hasImages ? ' xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"' : ""
    }>`,
  ];
  for (const u of urls) {
    out.push("<url>");
    out.push(`<loc>${xmlEscape(u.loc)}</loc>`);
    const lm = isoDate(u.lastmod);
    if (lm) out.push(`<lastmod>${lm}</lastmod>`);
    if (u.changefreq) out.push(`<changefreq>${u.changefreq}</changefreq>`);
    if (u.priority != null) out.push(`<priority>${u.priority.toFixed(1)}</priority>`);
    for (const img of u.images ?? []) {
      out.push("<image:image>");
      out.push(`<image:loc>${xmlEscape(img.loc)}</image:loc>`);
      if (img.title) out.push(`<image:title>${xmlEscape(img.title)}</image:title>`);
      out.push("</image:image>");
    }
    out.push("</url>");
  }
  out.push("</urlset>");
  return out.join("\n");
}

export function sitemapIndexXml(items: SitemapIndexItem[]): string {
  const out: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ];
  for (const it of items) {
    out.push("<sitemap>");
    out.push(`<loc>${xmlEscape(it.loc)}</loc>`);
    const lm = isoDate(it.lastmod);
    if (lm) out.push(`<lastmod>${lm}</lastmod>`);
    out.push("</sitemap>");
  }
  out.push("</sitemapindex>");
  return out.join("\n");
}
