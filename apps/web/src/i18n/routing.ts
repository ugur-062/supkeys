import { DEFAULT_LOCALE, LOCALES, LOCALE_COOKIE, ROUTE_PATHNAMES } from "@rothern/i18n";
import { defineRouting } from "next-intl/routing";

/**
 * Yönlendirme — i18n Faz 1 (docs/plan-i18n.md).
 *
 *  · Türkçe ÖN EKSİZ (`/urunler`), diğer diller ön ekli (`/en/urunler`,
 *    `/ru/urunler`) → bugünkü her adres ve SEO aynen kalır (`as-needed`).
 *  · Otomatik dil TESPİTİ YOK (`localeDetection: false`): tarayıcı diline ya da
 *    çereze göre yönlendirme yapılmaz — Googlebot `/`den `/en`e atılmaz, kök
 *    sayfa önbelleklenebilir kalır. Ziyaretçi dili üst çubuktaki seçiciden
 *    seçer; üye için panel `LocaleUrlSync` ile kayıtlı dile taşınır.
 *  · Yol PARÇALARI ÜÇ DİLDE (2026-09-24, kullanıcı kararı): `/en/products`,
 *    `/ru/tovary`; sözlük `@rothern/i18n` `ROUTE_PATHNAMES`. next-intl
 *    middleware dış yolu iç yola yeniden yazar ve yanlış biçimi (`/en/urunler`,
 *    `/products`) doğru biçime 308'ler. next-intl dize adresleri şablona
 *    EŞLEMEZ (`pathnames[href]` birebir arar; `/talep/rot-1` bilinmez ve
 *    olduğu gibi geçer) → `@/i18n/navigation` sarmalayıcısı çeviriyi kendi
 *    yapar, 117 çağrı yeri dize kalır.
 *  · hreflang bağlantıları `buildMetadata` yazar; middleware'in `Link`
 *    başlığı KAPALI (iki kaynak olmasın).
 */
export const routing = defineRouting({
  locales: LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  localePrefix: "as-needed",
  localeDetection: false,
  localeCookie: { name: LOCALE_COOKIE },
  alternateLinks: false,
  pathnames: ROUTE_PATHNAMES,
});
