import { timingSafeEqual } from "node:crypto";
import { Injectable, type ExecutionContext } from "@nestjs/common";
import { ThrottlerGuard, type ThrottlerRequest } from "@nestjs/throttler";
import { resolveClientIp, type IpRequestLike } from "./client-ip";

/** Web sunucusunun (SSR/ISR) API'ye gönderdiği paylaşılan sır başlığı. */
export const SSR_KEY_HEADER = "x-rothern-ssr";

/**
 * Web SSR çağrısı mı? (yayın denetimi 2026-09-28 Bölüm 11)
 *
 * Herkese açık sayfaların sunucu çizimi API'yi Vercel'in birkaç çıkış IP'sinden
 * çağırır; IP başına 100/dk tavanı dağıtım sonrası boş ISR önbelleğinde
 * (tarayıcılar + açılış trafiği) 429'a düşer → sayfa 500. Bu yüzden web
 * sunucusu `SEO_REVALIDATE_SECRET`i (Render ve Vercel'de ZATEN aynı değer,
 * web↔API sırrı) başlıkta gönderir; eşleşirse istek IP kovasına değil tek,
 * sonlu SSR kovasına sayılır (derin denetim MU-12; eskiden sınır ATLANIYORDU).
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
 * SSR bucket (derin denetim MU-12): trusted SSR requests are NOT exempt any
 * more — they share ONE finite bucket across all public endpoints. The old
 * full skip left anonymous traffic with no limiter at all: every unique query
 * string (`/urunler?q=<random>`) or `?onizleme=1` (no-store) misses the web
 * data cache and reaches the API with the secret header, so a single client
 * could drive unbounded facet scans. The limit is high enough for a cold ISR
 * cache after deploy; `THROTTLE_SSR_LIMIT` overrides it (per 60 s window,
 * per API instance — in-memory storage).
 */
export const SSR_BUCKET_TTL_MS = 60_000;
export const DEFAULT_SSR_LIMIT = 5000;

export function ssrBucketLimit(raw: string | undefined = process.env.THROTTLE_SSR_LIMIT): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_SSR_LIMIT;
}

/**
 * ThrottlerGuard — tracker olarak gerçek istemci IP'si (cf-connecting-ip
 * bayrağı açıksa) kullanır; aksi halde varsayılan `req.ip`. Cloudflare
 * arkasında tüm kullanıcıların tek CF IP'sinde toplanıp ortak 429 yemesini
 * (ve per-IP login limitinin anlamsızlaşmasını) kapatır. Web SSR çağrısı
 * (`isTrustedSsrRequest`) IP kovası yerine tek, sonlu SSR kovasına sayılır.
 */
@Injectable()
export class ClientIpThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(req: Record<string, unknown>): Promise<string> {
    return resolveClientIp(req as IpRequestLike);
  }

  protected override async handleRequest(props: ThrottlerRequest): Promise<boolean> {
    const { context } = props;
    if (context.getType() === "http" && isTrustedSsrRequest(context.switchToHttp().getRequest())) {
      // One bucket only: the other named throttlers ("auth") do not count SSR.
      if (props.throttler.name !== "default") return true;
      return super.handleRequest({
        ...props,
        limit: ssrBucketLimit(),
        ttl: SSR_BUCKET_TTL_MS,
        blockDuration: SSR_BUCKET_TTL_MS,
        getTracker: async () => "web-ssr",
        // Shared across every public endpoint (default key is per handler).
        generateKey: (_ctx, tracker, name) => `ssr-bucket:${name}:${tracker}`,
      });
    }
    return super.handleRequest(props);
  }
}
