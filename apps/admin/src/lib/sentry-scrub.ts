/**
 * Sentry'e giden olaylardan KİMLİK VE JETON ayıklama (API'deki `scrubRequestPii`
 * ile aynı ilke: hata izleme PII taşımaz).
 *
 * Buradaki asıl risk ADRESTE: şifre sıfırlama bağlantısı `?token=…`, ekip daveti
 * `/company/davet/<token>` yolunda jeton taşır. Olayın `request.url`i ve
 * `breadcrumb`ları bunları olduğu gibi gönderirdi.
 */
const SECRET_QUERY_KEYS = ["token", "code", "secret", "password", "email"];

export function scrubUrl(raw: string): string {
  try {
    const u = new URL(raw, "https://placeholder.local");
    for (const k of SECRET_QUERY_KEYS) if (u.searchParams.has(k)) u.searchParams.set(k, "[gizlendi]");
    // Yol parçasındaki jeton: /company/davet/<token>, /reset-password/<token>
    u.pathname = u.pathname.replace(
      /\/(davet|invite|reset-password|dogrula)\/[^/]+/gi,
      (_m, seg: string) => `/${seg}/[gizlendi]`,
    );
    return raw.startsWith("http") ? u.toString() : u.pathname + u.search;
  } catch {
    return raw;
  }
}

type EventLike = {
  request?: { url?: string; headers?: unknown; cookies?: unknown; data?: unknown };
  breadcrumbs?: Array<{ data?: Record<string, unknown> }>;
  user?: unknown;
};

/** Sentry `beforeSend`/`beforeSendTransaction` için ortak temizleyici. */
export function scrubEvent<T extends EventLike>(event: T): T {
  if (event.request) {
    if (event.request.url) event.request.url = scrubUrl(event.request.url);
    delete event.request.cookies;
    delete event.request.headers;
    delete event.request.data;
  }
  delete event.user;
  for (const b of event.breadcrumbs ?? []) {
    const url = b.data?.["url"];
    if (typeof url === "string") b.data!["url"] = scrubUrl(url);
    const from = b.data?.["from"];
    if (typeof from === "string") b.data!["from"] = scrubUrl(from);
    const to = b.data?.["to"];
    if (typeof to === "string") b.data!["to"] = scrubUrl(to);
  }
  return event;
}
