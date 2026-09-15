/**
 * CSRF çift-gönderim: backend JS-okunabilir admin CSRF çerezi yazar; mutating
 * isteklerde bu değeri `X-CSRF-Token` header'ında geri göndeririz.
 *
 * Çerez adı ORTAMA GÖRE: canlı/yerel `rk_admin_csrf`, staging `rks_admin_csrf`.
 * KURAL KOPYASI: `@rothern/shared` `helpers/cookie-names.ts` (admin o pakete
 * bağlı değil). Değişirse İKİSİ birlikte değişir — `csrf.test.ts` ile web'deki
 * test aynı tabloyu sınar.
 */
const STAGING_COOKIE_HOST = "staging.rothern.com";

export function adminCsrfCookieName(hostname: string): string {
  const h = hostname.trim().toLowerCase().replace(/^\./, "");
  const prefix = h === STAGING_COOKIE_HOST || h.endsWith(`.${STAGING_COOKIE_HOST}`) ? "rks_" : "rk_";
  return `${prefix}admin_csrf`;
}

export function readCsrfToken(): string | null {
  if (typeof document === "undefined") return null;
  const name = adminCsrfCookieName(window.location.hostname);
  const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}
