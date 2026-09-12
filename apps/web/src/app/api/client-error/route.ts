import * as Sentry from "@sentry/nextjs";

/**
 * Tarayıcıdan gelen hata bildirimini SUNUCUDA Sentry'e yazar.
 *
 * Tarayıcıya SDK koymamak için var (bkz. `lib/client-error.ts`). Burası
 * herkese açık bir uç: gövde küçük tutulur, IP başına kaba bir tavan
 * uygulanır, DSN yoksa sunucu günlüğüne düşer (hata KAYBOLMAZ).
 */
export const dynamic = "force-dynamic";

const MAX_BODY = 16_000;
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 30;
const hits = new Map<string, { n: number; until: number }>();

function throttled(ip: string): boolean {
  const now = Date.now();
  const cur = hits.get(ip);
  if (!cur || cur.until < now) {
    hits.set(ip, { n: 1, until: now + WINDOW_MS });
    if (hits.size > 5_000) for (const [k, v] of hits) if (v.until < now) hits.delete(k);
    return false;
  }
  cur.n += 1;
  return cur.n > MAX_PER_WINDOW;
}

export async function POST(req: Request): Promise<Response> {
  const ip =
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "bilinmiyor";
  if (throttled(ip)) return new Response(null, { status: 429 });

  const raw = await req.text();
  if (raw.length > MAX_BODY) return new Response(null, { status: 413 });

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return new Response(null, { status: 400 });
  }
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : undefined);
  const message = str(body.message, 500);
  if (!message) return new Response(null, { status: 400 });

  const err = new Error(message);
  err.name = str(body.name, 100) ?? "ClientError";
  const stack = str(body.stack, 8_000);
  if (stack) err.stack = stack;

  Sentry.captureException(err, {
    tags: { source: "browser", kind: str(body.kind, 40) ?? "window" },
    extra: {
      url: str(body.url, 500),
      digest: str(body.digest, 100),
      componentStack: str(body.componentStack, 2_000),
      userAgent: str(req.headers.get("user-agent"), 200),
    },
  });
  // DSN yoksa Sentry no-op → en azından sunucu günlüğüne yaz.
  if (!process.env.SENTRY_DSN && !process.env.NEXT_PUBLIC_SENTRY_DSN) {
    console.error("[istemci-hatası]", err.name, message, str(body.url, 200));
  }
  return new Response(null, { status: 204 });
}
