import { MARKETPLACE_ROUTES, listingPath } from "@/lib/public/marketplace";
import { fetchListingSitemap } from "@/lib/public/marketplace-api";
import { MARKETPLACE_LIVE } from "@/lib/public/marketplace-live";
import { resolveApiBaseUrl } from "@/lib/resolve-api-url";
import { resolveSiteUrl } from "@/lib/site-url";
import type { MetadataRoute } from "next";

/**
 * sitemap.xml — pazar yeri + firma profilleri + kurumsal sayfalar.
 *
 * KURAL: buraya YALNIZ dizinlenebilir URL girer. İlan tarafında bunu backend
 * belirler (`/public/listings/sitemap` yalnız `marketplaceIndexableWhere`den
 * geçenleri döndürür) — kapanmış ya da sahibi dizinlemeyi kapatmış ilan hiç
 * gelmez. Kapanmış ilanın sayfası SİTEDE DURUR ama sitemap'te yer almaz ve
 * `noindex` alır; süresi geçmiş ilanı indekste tutmak alan adının
 * güvenilirliğini aşağı çeker.
 *
 * Slug'lar `listingPath` ile üretilir — sayfanın kanonik URL'iyle BİREBİR
 * aynı fonksiyon. Ayrı ayrı kurulsalardı sitemap bir adresi, sayfa başka bir
 * kanoniği gösterir ve Google ikisini de güvensiz sayardı.
 */
export const revalidate = 3600;

interface CompanySitemapEntry {
  slug: string | null;
  updatedAt: string;
}

async function fetchCompanySlugs(): Promise<CompanySitemapEntry[]> {
  const apiBase = resolveApiBaseUrl();
  if (!apiBase) return [];
  try {
    const res = await fetch(`${apiBase}/public/companies/sitemap`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    return (await res.json()) as CompanySitemapEntry[];
  } catch {
    // Build veya API erişimi başarısızsa boş sitemap üret — kırma
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = resolveSiteUrl();
  // Yayın öncesi: sitemap BOŞ. Var olmayan (404 dönen) pazar yeri adreslerini
  // listelemek tarayıcıya yanlış bilgi vermek olurdu.
  if (!MARKETPLACE_LIVE) return [];
  const [companies, listings] = await Promise.all([
    fetchCompanySlugs(),
    fetchListingSitemap(),
  ]);

  const now = new Date();

  const hubs: MetadataRoute.Sitemap = (
    [
      { path: "/", priority: 1.0, changeFrequency: "hourly" as const },
      {
        path: MARKETPLACE_ROUTES.demands,
        priority: 0.9,
        changeFrequency: "hourly" as const,
      },
      {
        path: MARKETPLACE_ROUTES.offers,
        priority: 0.9,
        changeFrequency: "hourly" as const,
      },
      {
        path: MARKETPLACE_ROUTES.companies,
        priority: 0.8,
        changeFrequency: "daily" as const,
      },
      {
        path: "/nasil-calisir",
        priority: 0.6,
        changeFrequency: "monthly" as const,
      },
    ] as const
  ).map((h) => ({
    url: `${siteUrl}${h.path}`,
    lastModified: now,
    changeFrequency: h.changeFrequency,
    priority: h.priority,
  }));

  // Kurumsal/yasal sayfalar — güven sinyali + marka aramaları için indekste.
  const legal: MetadataRoute.Sitemap = [
    "/hakkimizda",
    "/iletisim",
    "/sozlesmeler/kullanici",
    "/sozlesmeler/aracilik",
    "/sozlesmeler/gizlilik",
    "/sozlesmeler/kvkk",
    "/sozlesmeler/mesafeli-satis",
    "/sozlesmeler/iade",
  ].map((path) => ({
    url: `${siteUrl}${path}`,
    lastModified: now,
    changeFrequency: "monthly" as const,
    priority: 0.4,
  }));

  const listingRoutes: MetadataRoute.Sitemap = listings.map((l) => ({
    url: `${siteUrl}${listingPath(l.type, l.number, l.title)}`,
    lastModified: new Date(l.updatedAt),
    changeFrequency: "daily",
    priority: 0.7,
  }));

  const companyRoutes: MetadataRoute.Sitemap = companies
    .filter((e): e is { slug: string; updatedAt: string } => !!e.slug)
    .map((e) => ({
      url: `${siteUrl}/firma/${e.slug}`,
      lastModified: new Date(e.updatedAt),
      changeFrequency: "weekly",
      priority: 0.8,
    }));

  return [...hubs, ...legal, ...listingRoutes, ...companyRoutes];
}
