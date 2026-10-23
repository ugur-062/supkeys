/**
 * Sentry'e giden olaylardan KİMLİK VE JETON ayıklama (API'deki `scrubRequestPii`
 * ile aynı ilke: hata izleme PII taşımaz).
 *
 * Buradaki asıl risk ADRESTE: şifre sıfırlama bağlantısı `?token=…`, ekip daveti
 * `/company/davet/<token>` yolunda jeton taşır. Olayın `request.url`i ve
 * `breadcrumb`ları bunları olduğu gibi gönderirdi.
 */
const SECRET_QUERY_KEYS = ["token", "code", "secret", "password", "email"];

// Token-bearing path segment: /company/davet/<token>, /reset-password/<token>.
const TOKEN_PATH_SEGMENT = /\/(davet|invite|reset-password|dogrula)\/[^/?#\s]+/gi;

export function scrubUrl(raw: string): string {
  try {
    const u = new URL(raw, "https://placeholder.local");
    for (const k of SECRET_QUERY_KEYS) if (u.searchParams.has(k)) u.searchParams.set(k, "[gizlendi]");
    // Yol parçasındaki jeton: /company/davet/<token>, /reset-password/<token>
    u.pathname = u.pathname.replace(
      TOKEN_PATH_SEGMENT,
      (_m, seg: string) => `/${seg}/[gizlendi]`,
    );
    return raw.startsWith("http") ? u.toString() : u.pathname + u.search;
  } catch {
    return raw;
  }
}

/**
 * Raw query string (`a=1&token=x`, optional leading `?`) — Sentry
 * `request.query_string` and breadcrumb `data["http.query"]`.
 */
export function scrubQueryString(raw: string): string {
  const lead = raw.startsWith("?") ? "?" : "";
  const out = scrubUrl(`/?${raw.slice(lead.length)}`);
  const i = out.indexOf("?");
  return lead + (i >= 0 ? out.slice(i + 1) : "");
}

/**
 * Free text that may embed a path but is not a URL (e.g. transaction name
 * `GET /tr/company/davet/<token>`): only the token path segment is masked.
 */
function scrubPathText(raw: string): string {
  return raw.replace(TOKEN_PATH_SEGMENT, (_m, seg: string) => `/${seg}/[gizlendi]`);
}

type EventLike = {
  request?: { url?: string; query_string?: unknown; headers?: unknown; cookies?: unknown; data?: unknown };
  breadcrumbs?: Array<{ data?: Record<string, unknown> }>;
  contexts?: Record<string, Record<string, unknown> | undefined>;
  transaction?: string;
  user?: unknown;
};

/** Sentry `beforeSend`/`beforeSendTransaction` için ortak temizleyici. */
export function scrubEvent<T extends EventLike>(event: T): T {
  if (event.request) {
    if (event.request.url) event.request.url = scrubUrl(event.request.url);
    // Derin denetim MU-12: query_string carried `?ref=` / `?token=` unmasked.
    const qs = event.request.query_string;
    if (typeof qs === "string") event.request.query_string = scrubQueryString(qs);
    else delete event.request.query_string;
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
    const query = b.data?.["http.query"];
    if (typeof query === "string") b.data!["http.query"] = scrubQueryString(query);
  }
  // `onRequestError` (Sentry.captureRequestError) stores Next's raw `req.url`
  // (path + query) in `contexts.nextjs.request_path` (derin denetim MU-12).
  const nextjs = event.contexts?.["nextjs"];
  if (nextjs && typeof nextjs["request_path"] === "string") {
    nextjs["request_path"] = scrubUrl(nextjs["request_path"]);
  }
  if (typeof event.transaction === "string") event.transaction = scrubPathText(event.transaction);
  return event;
}
