import { MARKETPLACE_LIVE } from "@/lib/public/marketplace-live";
import { resolveSiteUrl } from "@/lib/site-url";
import type { MetadataRoute } from "next";

/**
 * robots.txt — Next.js MetadataRoute.
 *
 * İzin verilen küme `lib/public-routes.ts` PUBLIC_ROUTE_PREFIXES ile aynı
 * olmalı: o dosya CSP/render tarafını, bu dosya tarayıcı tarafını yönetir.
 * Ayrışırlarsa ya taranamayan bir public sayfa kalır ya da panel taranır.
 */

/**
 * YAPAY ZEKÂ TARAYICILARI — AÇIK KARAR (2026-09-09, kullanıcı: "SEO ve GEO
 * çok yüksek olmalı").
 *
 * Bu ajanlar engellenmediğinde de gelirler; buradaki AÇIK `allow` satırı,
 * kararın bilinçli olduğunu belgelemek ve panel yollarını onlara da
 * kapatmak içindir. GEO'nun ön koşulu erişimdir: bir üretken motor
 * göremediği sayfayı cevabında KAYNAK GÖSTEREMEZ.
 *
 * Ayrım şu: arama/atıf ajanları (cevapta bağlantı verirler) ile toplu
 * derleme ajanları farklı işler yapar. İkisine de açığız — pazar yeri
 * içeriği zaten herkese açık, kapalı olan (ilan sahibi kimliği, kalem
 * gövdesi, fiyat) sunucuda projeksiyondan HİÇ çıkmıyor; tarayıcıya kapatmak
 * o veriyi korumaz, yalnız görünürlüğü keser.
 *
 * Google-Extended ve Applebot-Extended İÇERİK TARAMASI YAPMAZ; yalnız
 * "Gemini/Apple Intelligence bu içeriği kullanabilir mi" iznidir. İzin
 * vermek Google aramasındaki sıralamayı ETKİLEMEZ.
 */
const AI_AGENTS = [
  "GPTBot", // OpenAI dizini
  "OAI-SearchBot", // ChatGPT arama sonuçları
  "ChatGPT-User", // kullanıcı isteğiyle anlık getirme
  "PerplexityBot",
  "Perplexity-User",
  "ClaudeBot",
  "Claude-User",
  "Claude-SearchBot",
  "Google-Extended", // Gemini kullanım izni (tarayıcı değil)
  "Applebot-Extended",
  "meta-externalagent",
  "CCBot", // Common Crawl
];

/** Hiçbir ajanın girmemesi gereken yollar — tek kaynak. */
const DISALLOW = ["/company/", "/admin/", "/api/", "/auth/", "/dev/"];

export default function robots(): MetadataRoute.Robots {
  const siteUrl = resolveSiteUrl();
  // Yayın öncesi: hiçbir şey taranmasın. "Yakında" sayfasının indekslenmesi
  // alan adı için değersiz, hatta zararlı (içeriksiz sayfa sinyali).
  if (!MARKETPLACE_LIVE) {
    return {
      rules: [{ userAgent: "*", disallow: "/" }],
      sitemap: `${siteUrl}/sitemap.xml`,
      host: siteUrl,
    };
  }
  return {
    rules: [
      {
        userAgent: "*",
        // Liste `lib/public-routes.ts` PUBLIC_ROUTE_PREFIXES ile aynı küme
        // olmalı; `robots.test.ts` ikisini karşılaştırır. `/` zaten açık —
        // bu satırlar belgeleme ve niyet beyanı.
        allow: [
          "/",
          "/urunler",
          "/firmalar",
          "/alim-talepleri",
          "/firma/",
          "/talep/",
          "/nasil-calisir",
          "/sss",
          "/hakkimizda",
          "/iletisim",
          "/sozlesmeler",
        ],
        // `/company/` panelin tamamı (login/kayıt dahil) — dizinlenecek içerik
        // yok, tarama bütçesi yer. Süzgeçli varyantlar (`?kategori=`, `?il=`)
        // ENGELLENMEZ: gerçek içerik üretirler ve long-tail girişidir.
        disallow: DISALLOW,
      },
      ...AI_AGENTS.map((userAgent) => ({ userAgent, allow: "/", disallow: DISALLOW })),
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
