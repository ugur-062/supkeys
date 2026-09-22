import { DEFAULT_LOCALE, type Locale, type WebMessages } from "@rothern/i18n";
import trCommon from "@rothern/i18n/catalog/tr/common.json";
import { createTranslator } from "use-intl/core";

/**
 * React DIŞI çeviri köprüsü — axios interceptor'ları, zod hata haritası gibi
 * hook çağıramayan yerler için. Sağlayıcı altındaki `I18nRuntimeBridge`
 * aktif dili ve mesajları buraya KAYDEDER; kayıt yoksa (herkese açık sayfa,
 * sunucu, köprü mount olmadan atılan istek) Türkçe `common` kataloğu devreye
 * girer — hiçbir zaman boş metin ya da ham anahtar basılmaz.
 *
 * Yalnız `common` ad alanı yedeklenir: köprüsüz yüzeyde ihtiyaç duyulan tek
 * şey genel hata metinleri; katalogun tamamını istemciye gömmek yasak
 * (docs/plan-i18n.md — üç dilin metni paket boyutunu şişirir).
 */
type CommonKey = `common.${NestedKeys<typeof trCommon>}`;
type NestedKeys<T> = {
  [K in keyof T & string]: T[K] extends string ? K : `${K}.${NestedKeys<T[K]>}`;
}[keyof T & string];

type Values = Record<string, string | number | Date>;
type Translate = (key: string, values?: Values) => string;

const fallback: Translate = createTranslator({
  locale: DEFAULT_LOCALE,
  messages: { common: trCommon },
  onError: () => {},
  getMessageFallback: ({ namespace, key }) => (namespace ? `${namespace}.${key}` : key),
}) as unknown as Translate;

let registered: { locale: Locale; t: Translate } | null = null;

export function registerI18nRuntime(locale: Locale, messages: WebMessages): void {
  registered = {
    locale,
    t: createTranslator({
      locale,
      messages,
      onError: () => {},
      getMessageFallback: ({ namespace, key }) => (namespace ? `${namespace}.${key}` : key),
    }) as unknown as Translate,
  };
}

export function unregisterI18nRuntime(): void {
  registered = null;
}

/** Aktif dil — API isteklerine `Accept-Language` olarak gider. */
export function runtimeLocale(): Locale {
  return registered?.locale ?? DEFAULT_LOCALE;
}

/** `common.*` anahtarını aktif dilde çevirir; köprü yoksa Türkçe yedek. */
export function tRuntime(key: CommonKey, values?: Values): string {
  return (registered?.t ?? fallback)(key, values);
}
