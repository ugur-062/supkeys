/**
 * CSRF çift-gönderim (double-submit): backend JS-okunabilir `sk_csrf` cookie'si
 * yazar; mutating isteklerde bu değeri `X-CSRF-Token` header'ında geri göndeririz.
 * Cross-site saldırgan bu cookie'yi okuyamaz (same-origin) → header'ı üretemez.
 */
export function readCsrfToken(): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(/(?:^|;\s*)sk_csrf=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}
