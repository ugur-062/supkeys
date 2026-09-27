import { DEFAULT_LOCALE, LOCALES, internalRoutePath, isLocale, translateRoutePath, type Locale } from "@rothern/i18n";

/**
 * Dil farkında adres yardımcıları — React ve next-intl'e BAĞIMSIZ (middleware,
 * axios interceptor'ları, `window.location` atamaları ve sitemap bunları kullanır).
 * Kural: Türkçe ön eksiz, diğer diller `/<dil>` ön ekli (bkz. src/i18n/routing.ts);
 * yol PARÇALARI dile göre çevrilir (`@rothern/i18n` `ROUTE_PATHNAMES`, 2026-09-24):
 * giriş her zaman İÇ (Türkçe) yol, çıkış o dilin DIŞ yolu.
 */

/** İÇ yol + dil → ön ekli DIŞ yol: `/urunler` + en → `/en/products`; tr → `/urunler`; `/` + ru → `/ru`. */
export function localizePath(path: string, locale: Locale): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  const outer = translateRoutePath(clean, locale);
  if (locale === DEFAULT_LOCALE) return outer;
  return outer === "/" ? `/${locale}` : `/${locale}${outer}`;
}

/**
 * DIŞ adres → dil + İÇ yol: `/en/products?x=1` → { locale: "en", path: "/urunler?x=1" };
 * ön eksiz → tr. Kanonik olmayan biçim (`/en/urunler`, `/ru/products`) de İÇ yola iner.
 */
export function splitLocale(pathname: string): { locale: Locale; path: string } {
  const m = /^\/([a-z]{2})(?=\/|$|\?)/.exec(pathname);
  if (m && isLocale(m[1]) && m[1] !== DEFAULT_LOCALE) {
    const rest = pathname.slice(m[0].length);
    const outer = rest.startsWith("/") || rest === "" ? rest || "/" : `/${rest}`;
    return { locale: m[1], path: internalRoutePath(outer, m[1]) };
  }
  return { locale: DEFAULT_LOCALE, path: internalRoutePath(pathname || "/", DEFAULT_LOCALE) };
}

/** DIŞ adres → İÇ yol (dil bilgisi düşer). */
export function stripLocale(pathname: string): string {
  return splitLocale(pathname).path;
}

/**
 * hreflang haritası: her HAZIR dilin DIŞ adresi + `x-default`. Giriş İÇ yol.
 * `x-default` hazır İLK dile (LOCALES sırası: tr → en → ru) — çevirisi
 * gelmemiş/Türkçe olmayan kaynaklı içerikte olmayan (noindex) Türkçe sayfaya
 * gitmesin (2026-09-27 SEO denetimi). Hazır dil yoksa boş harita.
 */
export function localizedAlternates(path: string, locales: readonly Locale[] = LOCALES): Record<string, string> {
  const ready = LOCALES.filter((l) => locales.includes(l));
  const out: Record<string, string> = {};
  for (const locale of ready) out[locale] = localizePath(path, locale);
  if (ready.length) out["x-default"] = out[ready.includes(DEFAULT_LOCALE) ? DEFAULT_LOCALE : ready[0]!]!;
  return out;
}

/** `Link`/`router` girdisi: dize ya da `{ pathname, query, hash }` nesnesi (Next `UrlObject` alt kümesi). */
export type HrefInput = string | { pathname: string; query?: Record<string, string | number | (string | number)[]>; hash?: string };

/** Dize ya da `{ pathname }` nesnesi → istenen dilin DIŞ yolu (ön eksiz; ön eki next-intl ekler). */
export function toOuterHref(href: HrefInput, locale: Locale): HrefInput {
  if (typeof href === "string") return translateRoutePath(href, locale);
  return { ...href, pathname: translateRoutePath(href.pathname, locale) };
}

