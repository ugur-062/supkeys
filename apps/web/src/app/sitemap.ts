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
  slug: string;
  updatedAt: string;
}

async function fetchSupplierSlugs(): Promise<SitemapEntry[]> {
  const apiBase = resolveApiBaseUrl();
  if (!apiBase) return [];
  try {
    const res = await fetch(`${apiBase}/public/suppliers`, {
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
  const entries = await fetchSupplierSlugs();

  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: `${siteUrl}/`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1.0,
    },
    {
      url: `${siteUrl}/login`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.3,
    },
  ];

  const supplierRoutes: MetadataRoute.Sitemap = entries.map((e) => ({
    url: `${siteUrl}/${e.slug}`,
    lastModified: new Date(e.updatedAt),
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  return [...staticRoutes, ...supplierRoutes];
}
