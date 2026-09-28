import * as Sentry from "@sentry/nextjs";
import { scrubUrl } from "@/lib/sentry-scrub";

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
/**
 * Süreç başına toplam tavan (yayın denetimi 2026-09-28 Bölüm 5): IP başına
 * tavan tek başına Sentry kotasını korumaz — çok kaynaklı sel kotayı bitirir ve
 * gerçek hatalar düşer.
 */
const MAX_GLOBAL_PER_WINDOW = 600;
const hits = new Map<string, { n: number; until: number }>();
let global = { n: 0, until: 0 };

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

function globallyThrottled(): boolean {
  const now = Date.now();
  if (global.until < now) global = { n: 0, until: now + WINDOW_MS };
  global.n += 1;
  return global.n > MAX_GLOBAL_PER_WINDOW;
}

/**
 * İstemci IP'si Vercel'in yazdığı başlıklardan. Web Cloudflare arkasında DEĞİL:
 * `cf-connecting-ip`i istemci istediği gibi gönderip her istekte yeni "IP" ile
 * tavanı aşıyordu (yayın denetimi 2026-09-28 Bölüm 5). Vercel `x-real-ip` ve
 * `x-forwarded-for`u kendisi yazar (istemcininkini ezer).
 */
function clientIp(req: Request): string {
  return (
    req.headers.get("x-real-ip")?.trim() ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "bilinmiyor"
  );
}

export async function POST(req: Request): Promise<Response> {
  if (throttled(clientIp(req)) || globallyThrottled()) return new Response(null, { status: 429 });

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
      // İstemci zaten süzer; sunucu yeniden süzer (eski istemci/elle gönderim).
      url: (() => {
        const u = str(body.url, 500);
        return u ? scrubUrl(u) : undefined;
      })(),
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
