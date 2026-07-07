/**
 * CSRF çift-gönderim: backend JS-okunabilir `rk_csrf` cookie'si yazar; mutating
 * isteklerde bu değeri `X-CSRF-Token` header'ında geri göndeririz.
 */
export function readCsrfToken(): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(/(?:^|;\s*)rk_csrf=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}
