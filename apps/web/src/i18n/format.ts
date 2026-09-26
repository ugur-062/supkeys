import { DEFAULT_LOCALE, type Locale } from "@rothern/i18n";

/** BCP-47 etiketleri — `Intl` API'leri ve `toLocaleString` için (tek kaynak). */
export const INTL_LOCALE: Record<Locale, string> = { tr: "tr-TR", en: "en-US", ru: "ru-RU" };

/** Sayı biçimi (ICU `{n}` düz argümanı gruplamaz — "1234 firma" olurdu). Sunucu ve istemci ortak. */
export function formatNumber(n: number, locale: Locale = DEFAULT_LOCALE): string {
  return n.toLocaleString(INTL_LOCALE[locale] ?? "tr-TR");
}
