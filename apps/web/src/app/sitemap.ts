import { resolveApiBaseUrl } from "@/lib/resolve-api-url";
import { resolveSiteUrl } from "@/lib/site-url";
import type { MetadataRoute } from "next";

/**
 * V2-SEO — Dynamic sitemap.xml — Next.js 15 MetadataRoute convention.
 *
 * Backend'ten tüm görünür tedarikçi slug'larını çekip her birine /{slug}
 * entry'si ekler. Statik route'lar (anasayfa, login) baş sıralarda.
 *
 * Cache: ISR 1 saat. Yeni PREMIUM tedarikçi eklendiğinde 1 saatte sitemap
 * güncellenir; Google'ın tarama sıklığı zaten bundan daha yavaş.
 */
export const revalidate = 3600;

interface SitemapEntry {
  slug: string | null;
  updatedAt: string;
}

async function fetchCompanySlugs(): Promise<SitemapEntry[]> {
  const apiBase = resolveApiBaseUrl();
  if (!apiBase) return [];
  try {
    const res = await fetch(`${apiBase}/public/companies/sitemap`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    return (await res.json()) as SitemapEntry[];
  } catch {
    // Build veya API erişimi başarısızsa boş sitemap üret — kırma
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = resolveSiteUrl();
  const entries = await fetchCompanySlugs();

  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: `${siteUrl}/`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1.0,
    },
    // Kurumsal/yasal sayfalar — güven sinyali + marka aramaları için indekste.
    ...[
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
      lastModified: new Date(),
      changeFrequency: "monthly" as const,
      priority: 0.4,
    })),
  ];

  const companyRoutes: MetadataRoute.Sitemap = entries
    .filter((e): e is { slug: string; updatedAt: string } => !!e.slug)
    .map((e) => ({
      url: `${siteUrl}/firma/${e.slug}`,
      lastModified: new Date(e.updatedAt),
      changeFrequency: "weekly",
      priority: 0.8,
    }));

  return [...staticRoutes, ...companyRoutes];
}
