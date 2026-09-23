import "server-only";

import { DEFAULT_LOCALE, type Locale, type WebTranslator } from "@rothern/i18n";
import { createWebTranslator } from "@rothern/i18n/translator";
import { APP_TIME_ZONE } from "@/lib/time-zone";
import type { PriceLabels } from "@/lib/public/product-price";

/**
 * SUNUCU tarafı, React dışı çeviri (metadata üreticileri, JSON-LD, OG kartı).
 * Katalogun tamamını yükler — bu yüzden `server-only`: istemci paketine
 * girmesin (docs/plan-i18n.md, "katalogu istemciye gömme").
 */
const cache = new Map<Locale, WebTranslator>();

export function webTranslator(locale: Locale = DEFAULT_LOCALE): WebTranslator {
  let t = cache.get(locale);
  if (!t) {
    t = createWebTranslator(locale, { timeZone: APP_TIME_ZONE });
    cache.set(locale, t);
  }
  return t;
}

/** `productPrice` için dil bilen etiketler (sunucu). İstemci karşılığı `usePriceLabels`. */
export function priceLabelsFor(locale: Locale = DEFAULT_LOCALE): PriceLabels {
  const t = webTranslator(locale);
  return {
    locale,
    onRequest: t("web.marketplace.price.onRequest"),
    fromQty: (qty, unit) => t("web.marketplace.price.fromQty", { qty, unit }),
  };
}

const INTL: Record<Locale, string> = { tr: "tr-TR", en: "en-US", ru: "ru-RU" };

/** Sunucu tarafı sayı biçimi (ICU `{n}` düz argümanı gruplamaz). */
export function formatNumber(n: number, locale: Locale = DEFAULT_LOCALE): string {
  return n.toLocaleString(INTL[locale] ?? "tr-TR");
}
