import type { MetadataRoute } from "next";

/**
 * Admin paneli TÜMÜYLE indeksleme dışı (Dalga B-4, denetim P10).
 *
 * `apps/web`'in robots.txt'i var ve `/admin/` yolunu engelliyor — ama admin
 * AYRI bir uygulama ve AYRI bir alan adında (admin.rothern.com) yayınlanıyor,
 * yani web'in kuralı oraya hiç uygulanmıyordu. Admin uygulamasının kendi
 * robots.txt'i HİÇ YOKTU → giriş sayfası ve rota isimleri arama motorlarınca
 * taranabilir durumdaydı. (robots.txt bir güvenlik sınırı değildir — asıl kapı
 * auth — ama yönetim yüzeyini ifşa etmenin bir anlamı da yok.)
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", disallow: "/" }],
  };
}
