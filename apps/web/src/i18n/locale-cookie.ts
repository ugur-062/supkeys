import { DEFAULT_LOCALE, LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, pickLocale, type Locale } from "@rothern/i18n";

/** Tarayıcıdaki dil çerezini okur (yoksa/bozuksa null). SSR'da null. */
export function readLocaleCookie(): Locale | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(new RegExp(`(?:^|; )${LOCALE_COOKIE}=([^;]*)`));
  return m ? pickLocale(decodeURIComponent(m[1] ?? "")) : null;
}

/**
 * Dil çerezini yazar — httpOnly DEĞİL (gizli veri yok), SameSite=Lax, 1 yıl.
 * Sunucu (`src/i18n/request.ts`) ve Faz 1 middleware'i aynı çerezi okur.
 */
export function writeLocaleCookie(locale: Locale): void {
  if (typeof document === "undefined") return;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${LOCALE_COOKIE}=${locale}; Path=/; Max-Age=${LOCALE_COOKIE_MAX_AGE}; SameSite=Lax${secure}`;
}

export function effectiveClientLocale(): Locale {
  return readLocaleCookie() ?? DEFAULT_LOCALE;
}
