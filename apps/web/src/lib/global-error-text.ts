import { DEFAULT_LOCALE, isLocale, type Locale } from "@rothern/i18n";
import trCommon from "@rothern/i18n/catalog/tr/common.json";
import enCommon from "@rothern/i18n/catalog/en/common.json";
import ruCommon from "@rothern/i18n/catalog/ru/common.json";

/**
 * Kök düzen çöktüğünde (`app/global-error.tsx`) çeviri sağlayıcısı da YOK →
 * metin doğrudan `common` kataloğundan (üç dil birlikte ~2 kB; katalogun
 * geri kalanı istemciye girmez). Dil adresin ön ekinden (`/en/…`, `/ru/…`;
 * Türkçe ön eksiz).
 */
type GlobalErrorText = { title: string; body: string; retry: string };

const CATALOG: Record<Locale, { globalError?: Partial<GlobalErrorText> }> = {
  tr: trCommon,
  en: enCommon,
  ru: ruCommon,
};

export function globalErrorText(locale: Locale): GlobalErrorText {
  const tr = trCommon.globalError;
  const own = CATALOG[locale].globalError ?? {};
  return { title: own.title ?? tr.title, body: own.body ?? tr.body, retry: own.retry ?? tr.retry };
}

/** Adresin ilk parçası desteklenen bir dilse o, değilse Türkçe (ön eksiz). */
export function localeFromPathname(pathname: string): Locale {
  const first = pathname.split("/")[1] ?? "";
  return isLocale(first) ? first : DEFAULT_LOCALE;
}
