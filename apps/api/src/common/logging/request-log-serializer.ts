import { maskSensitiveQuery, maskSensitiveUrl } from "./mask-sensitive-url";

/**
 * pino-http `req` serializer (access log + every service line bound to the
 * request context via nestjs-pino).
 *
 * HEADERS ARE ALLOWLISTED (derin denetim MU-12): pino-std-serializers copies
 * the whole `req.headers` object; spreading it through meant every secret
 * header reached the log in plain text — `x-rothern-ssr` (=
 * SEO_REVALIDATE_SECRET, sent on every web SSR call), `x-csrf-token`,
 * `svix-signature`, client IP headers (`x-forwarded-for`, `true-client-ip`).
 * A redact denylist misses the next new header; an allowlist does not.
 * `redact.paths` in app.module stays as a second layer.
 */
export const LOGGED_REQUEST_HEADERS = [
  "host",
  "user-agent",
  "referer",
  "origin",
  "content-type",
  "content-length",
  "accept",
  "accept-language",
  "x-request-id",
] as const;

function pickHeaders(headers: unknown): Record<string, unknown> | undefined {
  if (!headers || typeof headers !== "object") return undefined;
  const src = headers as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const name of LOGGED_REQUEST_HEADERS) {
    const v = src[name];
    if (v === undefined) continue;
    // Referer may carry a token path/query (invite, reset links).
    out[name] = name === "referer" && typeof v === "string" ? maskSensitiveUrl(v) : v;
  }
  return out;
}

export function serializeRequestForLog(req: Record<string, unknown>): Record<string, unknown> {
  return {
    ...req,
    url: maskSensitiveUrl(req.url as string | undefined),
    // The std serializer also writes `query` (launch audit 2026-09-28 part 5).
    ...("query" in req ? { query: maskSensitiveQuery(req.query) } : {}),
    ...("headers" in req ? { headers: pickHeaders(req.headers) } : {}),
  };
}
