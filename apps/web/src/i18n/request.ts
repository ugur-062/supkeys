import { WEB_NAMESPACES, messagesFor } from "@rothern/i18n/messages";
import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { APP_TIME_ZONE } from "@/lib/time-zone";
import { routing } from "./routing";

/**
 * next-intl istek yapılandırması — i18n Faz 1 (`[locale]` segmenti).
 *
 * Dil YALNIZ URL segmentinden gelir (`requestLocale`); çerez/başlık OKUNMAZ.
 * Bu sayede herkese açık sayfalar dil başına statik/ISR kalır (`cookies()`
 * dinamik API'dir — docs/plan-i18n.md tuzağı). Geçersiz segment → varsayılan.
 */
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
  return {
    locale,
    messages: messagesFor(locale, WEB_NAMESPACES),
    timeZone: APP_TIME_ZONE,
    // Eksik anahtar: geliştirici hatası — anahtar yolu görünür kalsın, üretim düşmesin.
    getMessageFallback: ({ namespace, key }) => (namespace ? `${namespace}.${key}` : key),
  };
});
