import { resolveSiteUrl } from "@/lib/site-url";
import type { MetadataRoute } from "next";

/**
 * V2-SEO — robots.txt — Next.js 15 MetadataRoute convention.
 *
 * Genel kural:
 *  - / (anasayfa), /<slug> (public tedarikçi profili), /login (giriş) → indexlenir
 *  - Tüm panel/auth callback/admin/api yolları → engellenir
 */
export default function robots(): MetadataRoute.Robots {
  const siteUrl = resolveSiteUrl();
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/firma/"],
        disallow: ["/company/", "/admin/", "/api/", "/auth/"],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
