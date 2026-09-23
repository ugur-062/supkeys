import { DEFAULT_LOCALE, LOCALES, isLocale, type Locale } from "@rothern/i18n";

/**
 * Dil farkında adres yardımcıları — React ve next-intl'e BAĞIMSIZ (middleware,
 * axios interceptor'ları, `window.location` atamaları ve sitemap bunları kullanır).
 * Kural: Türkçe ön eksiz, diğer diller `/<dil>` ön ekli (bkz. src/i18n/routing.ts).
 */

/** `/urunler` + en → `/en/urunler`; tr → aynı; `/` + ru → `/ru`. */
export function localizePath(path: string, locale: Locale): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  if (locale === DEFAULT_LOCALE) return clean;
  return clean === "/" ? `/${locale}` : `/${locale}${clean}`;
}

/** `/en/urunler?x=1` → { locale: "en", path: "/urunler?x=1" }; ön eksiz → tr. */
export function splitLocale(pathname: string): { locale: Locale; path: string } {
  const m = /^\/([a-z]{2})(?=\/|$|\?)/.exec(pathname);
  if (m && isLocale(m[1]) && m[1] !== DEFAULT_LOCALE) {
    const rest = pathname.slice(m[0].length);
    return { locale: m[1], path: rest.startsWith("/") || rest === "" ? rest || "/" : `/${rest}` };
  }
  return { locale: DEFAULT_LOCALE, path: pathname || "/" };
}

export function stripLocale(pathname: string): string {
  return splitLocale(pathname).path;
}

/** hreflang haritası: her dil + `x-default` (Türkçe, ön eksiz). */
export function localizedAlternates(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const locale of LOCALES) out[locale] = localizePath(path, locale);
  out["x-default"] = localizePath(path, DEFAULT_LOCALE);
  return out;
}
