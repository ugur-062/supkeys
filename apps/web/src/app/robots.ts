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
        allow: ["/", "/login"],
        disallow: [
          "/dashboard/",
          "/supplier/",
          "/admin/",
          "/api/",
          "/auth/",
          "/accept-invite/",
          "/register/",
          "/forgot-password",
          "/reset-password",
          "/demo-talep",
        ],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
