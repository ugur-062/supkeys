/**
 * V2-SEO — Frontend canonical base URL.
 *
 * `NEXT_PUBLIC_SITE_URL` env'i SSR + client'tan da okunabilir.
 * - Dev'de fallback: http://localhost:3000
 * - Prod'da set edilmeli (örn. https://rothern.com); aksi sitemap/robots
 *   yanlış kanonik URL üretir, Google indexlenmesi bozulur.
 */
export function resolveSiteUrl(): string {
  const url = process.env.NEXT_PUBLIC_SITE_URL;
  if (url && url.length > 0) return url.replace(/\/$/, "");
  return "http://localhost:3000";
}
