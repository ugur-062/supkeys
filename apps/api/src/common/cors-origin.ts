/**
 * CORS origin izin kararı — saf/test edilebilir (main.ts inline callback'inden
 * çıkarıldı).
 *
 * GÜVENLİK: `*.vercel.app` jokeri artık VARSAYILAN KAPALI. Eskiden regex kodda
 * sabitti → `CORS_ORIGINS` strict olsa bile HERHANGİ bir `*.vercel.app` origin'i
 * credentials'lı istek atabiliyordu (SameSite=none + guard-bypass ile birlikte
 * CSRF/veri sızıntısı). Artık yalnız `CORS_ALLOW_VERCEL=true` (preview/demo
 * ortamı) iken açılır; prod'da kapalı.
 */
const VERCEL_ORIGIN = /^https:\/\/[a-z0-9-]+\.vercel\.app$/i;

export function isCorsOriginAllowed(
  origin: string | undefined,
  opts: { corsOrigins: string[]; allowVercel: boolean },
): boolean {
  // origin yok (curl / same-origin / mobil) → engelleme.
  if (!origin) return true;
  if (opts.corsOrigins.includes(origin)) return true;
  if (opts.allowVercel && VERCEL_ORIGIN.test(origin)) return true;
  return false;
}
