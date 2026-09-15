import { cookieNamePrefix, cookieNames } from "@rothern/shared";

/**
 * CSRF çift-gönderim (double-submit): backend JS-okunabilir CSRF çerezi yazar;
 * mutating isteklerde bu değeri `X-CSRF-Token` header'ında geri göndeririz.
 * Cross-site saldırgan bu cookie'yi okuyamaz (same-origin) → header'ı üretemez.
 *
 * Çerez adı ORTAMA GÖRE: canlı/yerel `rk_csrf`, staging `rks_csrf` — ön ek
 * tarayıcının alan adından türetilir, API aynı kuralı `COOKIE_DOMAIN`dan
 * uygular (`@rothern/shared` `cookie-names.ts`). Aynı ad kullanılırken canlının
 * `.rothern.com` çerezi staging'e de gidiyor, iki `rk_csrf` çakışıyordu.
 */
export function csrfCookieName(hostname: string): string {
  return cookieNames(cookieNamePrefix(hostname)).companyCsrf;
}

export function readCsrfToken(): string | null {
  if (typeof document === "undefined") return null;
  const name = csrfCookieName(window.location.hostname);
  const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}
