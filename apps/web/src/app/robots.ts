import { resolveSiteUrl } from "@/lib/site-url";
import type { MetadataRoute } from "next";

/**
 * robots.txt — Next.js MetadataRoute.
 *
 * İzin verilen küme `lib/public-routes.ts` PUBLIC_ROUTE_PREFIXES ile aynı
 * olmalı: o dosya CSP/render tarafını, bu dosya tarayıcı tarafını yönetir.
 * Ayrışırlarsa ya taranamayan bir public sayfa kalır ya da panel taranır.
 */
export default function robots(): MetadataRoute.Robots {
  const siteUrl = resolveSiteUrl();
  return {
    rules: [
      {
        userAgent: "*",
        allow: [
          "/",
          "/firma/",
          "/alim-talepleri",
          "/satilik",
          "/tedarikciler",
          "/talep/",
          "/ilan/",
          "/nasil-calisir",
        ],
        // `/company/` panelin tamamı (login/kayıt dahil) — dizinlenecek içerik
        // yok, tarama bütçesi yer. Süzgeçli varyantlar (`?kategori=`, `?il=`)
        // ENGELLENMEZ: gerçek içerik üretirler ve long-tail girişidir.
        disallow: ["/company/", "/admin/", "/api/", "/auth/"],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
