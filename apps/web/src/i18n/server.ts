import "server-only";

import { DEFAULT_LOCALE, type Locale, type WebTranslator } from "@rothern/i18n";
import { createWebTranslator } from "@rothern/i18n/translator";
import { APP_TIME_ZONE } from "@/lib/time-zone";
import type { PriceLabels } from "@/lib/public/product-price";
import { quantityWith, type SeoT } from "@/lib/seo/entities";
import { intlLocale } from "./format";

export { formatNumber } from "./format";

/**
 * SUNUCU tarafı, React dışı çeviri (metadata üreticileri, JSON-LD, OG kartı).
 * Katalogun tamamını yükler — bu yüzden `server-only`: istemci paketine
 * girmesin (docs/plan-i18n.md, "katalogu istemciye gömme").
 *
 * ⚠️ Bu modülü İSTEMCİDE de çizilen bir bileşenin import zincirine SOKMA:
 * `server-only` derlemede kırar (2026-09-23'te `entities.ts` üzerinden
 * `product-detail` → panel sayfası zinciriyle yaşandı; staging 4 dağıtım
 * kırmızı). Paylaşılan üreticiler çevirmeni PARAMETRE alır (`SeoT`):
 * sunucuda `seoT(locale)`, istemcide `useSeoT()` (i18n/domain.ts).
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

/** `entities.ts` üreticileri için gevşek anahtarlı çevirmen (sunucu). */
export function seoT(locale: Locale = DEFAULT_LOCALE): SeoT {
  const t = webTranslator(locale);
  return (key, values) => t(key as never, values as never);
}

/** `productPrice` için dil bilen etiketler (sunucu). İstemci karşılığı `usePriceLabels`. */
export function priceLabelsFor(locale: Locale = DEFAULT_LOCALE): PriceLabels {
  const t = webTranslator(locale);
  return {
    locale: intlLocale(locale),
    onRequest: t("web.marketplace.price.onRequest"),
    fromQty: (n, unit, code) =>
      t("web.marketplace.price.fromQty", { qty: quantityWith(seoT(locale), n, unit, code) }),
  };
}
