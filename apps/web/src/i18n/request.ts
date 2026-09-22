import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, pickLocale } from "@rothern/i18n";
import { WEB_NAMESPACES, messagesFor } from "@rothern/i18n/messages";
import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";
import { APP_TIME_ZONE } from "@/lib/time-zone";

/**
 * next-intl istek yapılandırması — i18n Faz 0 (YÖNLENDİRMESİZ).
 *
 * Dil sırası: `[locale]` segmenti (Faz 1'de gelir; bugün undefined) → `NEXT_LOCALE`
 * çerezi → tr. `cookies()` DİNAMİK API'dir: bu dosya yalnız dinamik rotalardan
 * (panel `app/company`, force-dynamic) tetiklenir. Herkese açık statik/ISR
 * sayfalar next-intl API'si çağırmaz ki statik kalsınlar (docs/plan-i18n.md).
 */
export default getRequestConfig(async ({ requestLocale }) => {
  const fromSegment = await requestLocale;
  let locale = isLocale(fromSegment) ? fromSegment : null;
  if (!locale) {
    const store = await cookies();
    locale = pickLocale(store.get(LOCALE_COOKIE)?.value) ?? DEFAULT_LOCALE;
  }
  return {
    locale,
    messages: messagesFor(locale, WEB_NAMESPACES),
    timeZone: APP_TIME_ZONE,
    // Eksik anahtar: geliştirici hatası — anahtar yolu görünür kalsın, üretim düşmesin.
    getMessageFallback: ({ namespace, key }) => (namespace ? `${namespace}.${key}` : key),
  };
});
