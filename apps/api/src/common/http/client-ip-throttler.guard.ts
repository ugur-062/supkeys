import { timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import { Injectable, type ExecutionContext } from "@nestjs/common";
import { ThrottlerGuard, type ThrottlerRequest } from "@nestjs/throttler";
import { resolveClientIp, type IpRequestLike } from "./client-ip";

/** Web sunucusunun (SSR/ISR) API'ye gönderdiği paylaşılan sır başlığı. */
export const SSR_KEY_HEADER = "x-rothern-ssr";

/**
 * Real visitor IP forwarded by the web server on DYNAMIC renders (derin denetim
 * MU-12 review). Trusted ONLY together with a valid `x-rothern-ssr` secret —
 * anyone else can send it, so it is ignored on every other request.
 */
export const SSR_CLIENT_IP_HEADER = "x-rothern-client-ip";

/**
 * Web SSR çağrısı mı? (yayın denetimi 2026-09-28 Bölüm 11)
 *
 * Herkese açık sayfaların sunucu çizimi API'yi Vercel'in birkaç çıkış IP'sinden
 * çağırır; IP başına 100/dk tavanı dağıtım sonrası boş ISR önbelleğinde
 * (tarayıcılar + açılış trafiği) 429'a düşer → sayfa 500. Bu yüzden web
 * sunucusu `SEO_REVALIDATE_SECRET`i (Render ve Vercel'de ZATEN aynı değer,
 * web↔API sırrı) başlıkta gönderir; eşleşirse istek IP kovasına değil sonlu
 * SSR kovasına sayılır (derin denetim MU-12; eskiden sınır ATLANIYORDU).
 * Sızıntı yüzeyi dar: yalnız GET ∧ `/api/public/*` (salt-okunur, anonim
 * projeksiyon). Sır yoksa ya da kısaysa atlama YOK (bugünkü davranış).
 */
export function isTrustedSsrRequest(
  req: { method?: string; url?: string; originalUrl?: string; headers?: Record<string, string | string[] | undefined> },
  secret: string | undefined = process.env.SEO_REVALIDATE_SECRET,
): boolean {
  if (!secret || secret.length < 16) return false;
  if ((req.method ?? "").toUpperCase() !== "GET") return false;
  const path = (req.originalUrl ?? req.url ?? "").split("?")[0] ?? "";
  if (!path.startsWith("/api/public/")) return false;
  const raw = req.headers?.[SSR_KEY_HEADER];
  const got = Array.isArray(raw) ? raw[0] : raw;
  if (!got) return false;
  const a = Buffer.from(got);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * SSR buckets (derin denetim MU-12): trusted SSR requests are NOT exempt any
 * more. The old full skip left anonymous traffic with no limiter at all: every
 * unique query string (`/urunler?q=<random>`) or `?onizleme=1` (no-store)
 * misses the web data cache and reaches the API with the secret header.
 *
 * - Attributed (web sent a valid `x-rothern-client-ip`, i.e. any dynamic
 *   render: indexes, `/firma/<slug>`, city pages; RM-12): per-visitor bucket,
 *   shared across all public endpoints, `THROTTLE_PUBLIC_LIMIT` (same ceiling
 *   a visitor gets calling the public API directly). It does NOT touch the
 *   global SSR bucket, so one visitor flooding filtered/preview/random-slug
 *   URLs cannot lock every other visitor out. The web keeps its data cache in
 *   `unstable_cache` keyed on (url, locale), so the IP only reaches the API on
 *   a real cache miss and never splits the shared cache.
 * - Unattributed (ISR renders, route handlers, OG images): ONE global bucket,
 *   `THROTTLE_SSR_LIMIT`. High enough for a cold ISR cache after deploy; a 429
 *   here keeps the last good ISR copy.
 *
 * Residual risk: ISR routes cannot read request headers without turning
 * dynamic, so random path segments there (`/talep/<random>`,
 * `/firma/<slug>/urun/<random>`, `.../opengraph-image`) still count against
 * the global bucket. Mitigation lives at the edge: a per-IP rate rule in
 * Vercel Firewall for `/talep/*`, `/firma/*`, `/urunler/*`.
 *
 * Per 60 s window, per API instance (in-memory storage).
 */
export const SSR_BUCKET_TTL_MS = 60_000;
export const DEFAULT_SSR_LIMIT = 5000;
export const DEFAULT_SSR_CLIENT_LIMIT = 600;

function positiveInt(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export function ssrBucketLimit(raw: string | undefined = process.env.THROTTLE_SSR_LIMIT): number {
  return positiveInt(raw, DEFAULT_SSR_LIMIT);
}

export function ssrClientLimit(raw: string | undefined = process.env.THROTTLE_PUBLIC_LIMIT): number {
  return positiveInt(raw, DEFAULT_SSR_CLIENT_LIMIT);
}

/**
 * Visitor IP from `x-rothern-client-ip`. Call ONLY after `isTrustedSsrRequest`
 * passed; anything that is not a literal IP is ignored (→ global bucket).
 */
export function ssrClientIp(req: { headers?: Record<string, string | string[] | undefined> }): string | undefined {
  const raw = req.headers?.[SSR_CLIENT_IP_HEADER];
  const v = (Array.isArray(raw) ? raw[0] : raw)?.trim();
  return v && isIP(v) ? v : undefined;
}

/**
 * ThrottlerGuard — tracker olarak gerçek istemci IP'si (cf-connecting-ip
 * bayrağı açıksa) kullanır; aksi halde varsayılan `req.ip`. Cloudflare
 * arkasında tüm kullanıcıların tek CF IP'sinde toplanıp ortak 429 yemesini
 * (ve per-IP login limitinin anlamsızlaşmasını) kapatır. Web SSR çağrısı
 * (`isTrustedSsrRequest`) IP kovası yerine SSR kovasına sayılır: ziyaretçi IP'si
 * iletildiyse ziyaretçi başına, yoksa tek, sonlu ortak kova.
 */
@Injectable()
export class ClientIpThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(req: Record<string, unknown>): Promise<string> {
    return resolveClientIp(req as IpRequestLike);
  }

  protected override async handleRequest(props: ThrottlerRequest): Promise<boolean> {
    const { context } = props;
    if (context.getType() === "http") {
      const req = context.switchToHttp().getRequest();
      if (isTrustedSsrRequest(req)) {
        // One bucket only: the other named throttlers ("auth") do not count SSR.
        if (props.throttler.name !== "default") return true;
        const visitorIp = ssrClientIp(req);
        return super.handleRequest({
          ...props,
          limit: visitorIp ? ssrClientLimit() : ssrBucketLimit(),
          ttl: SSR_BUCKET_TTL_MS,
          blockDuration: SSR_BUCKET_TTL_MS,
          getTracker: async () => (visitorIp ? `ip:${visitorIp}` : "web-ssr"),
          // Shared across every public endpoint (default key is per handler).
          generateKey: (_ctx, tracker, name) => `ssr-bucket:${name}:${tracker}`,
        });
      }
    }
    return super.handleRequest(props);
  }
}
