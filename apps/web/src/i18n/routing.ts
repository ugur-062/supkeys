import { DEFAULT_LOCALE, LOCALES, LOCALE_COOKIE } from "@rothern/i18n";
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
 *  · Yol PARÇALARI Faz 1'de çevrilmez (`/en/urunler`, `/en/products` değil):
 *    next-intl `pathnames` her bağlantının tipli nesne olmasını ister, 117
 *    dosyayı yeniden yazmak Faz 1 kapsamı dışı. Karar tek yerde değişir.
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
});
