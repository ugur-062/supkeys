import { Global, Injectable, Module } from "@nestjs/common";
import type { ApiTranslator, Locale } from "@rothern/i18n";
import { createApiTranslator } from "@rothern/i18n/translator";
import { currentLocale } from "./locale-context";

const translators = new Map<Locale, ApiTranslator>();

/** Dil başına önbellekli çevirmen (common + api + email ad alanları). */
export function translatorFor(locale: Locale = currentLocale()): ApiTranslator {
  let t = translators.get(locale);
  if (!t) {
    t = createApiTranslator(locale);
    translators.set(locale, t);
  }
  return t;
}

type TranslateArgs = Parameters<ApiTranslator>;

/**
 * Katalog anahtarı (tipli): `common + api + email` ağacındaki her yaprak.
 * Bildirim/e-posta yükleri metin yerine ANAHTAR taşısın diye dışa aktarılır —
 * metin alıcı başına, alıcının diliyle üretilir (bkz. `renderPayload`).
 */
export type ApiMessageKey = TranslateArgs[0];

/**
 * DI dışı kısayol: `tApi("api.validation.required")`. Dil verilmezse istek
 * bağlamından okunur. Servislerde DI tercih edilir (`I18nService`), ama
 * `main.ts` exceptionFactory gibi DI'sız yerler bunu kullanır.
 */
export function tApi(key: TranslateArgs[0], values?: Record<string, string | number | Date>, locale?: Locale): string {
  const t = translatorFor(locale);
  return (t as unknown as (k: string, v?: Record<string, string | number | Date>) => string)(key, values);
}

/**
 * Kısa ay adı — istek dilinde (`Intl`; tr → "Oca", "Şub", … eski sabit
 * listeyle birebir). Biçimleyici dil başına önbellekli.
 */
const monthFormatters = new Map<Locale, Intl.DateTimeFormat>();
export function shortMonthLabel(d: Date, locale: Locale = currentLocale()): string {
  let f = monthFormatters.get(locale);
  if (!f) {
    f = new Intl.DateTimeFormat(locale, { month: "short" });
    monthFormatters.set(locale, f);
  }
  return f.format(d);
}

@Injectable()
export class I18nService {
  /** İstek bağlamındaki dil. */
  locale(): Locale {
    return currentLocale();
  }

  /** İstek dilinde (ya da verilen dilde) çeviri. */
  t(key: TranslateArgs[0], values?: Record<string, string | number | Date>, locale?: Locale): string {
    return tApi(key, values, locale);
  }

  /** Belirli bir alıcı için çevirmen (bildirim/e-posta: alıcının dili). */
  for(locale: Locale): ApiTranslator {
    return translatorFor(locale);
  }
}

@Global()
@Module({
  providers: [I18nService],
  exports: [I18nService],
})
export class I18nModule {}
