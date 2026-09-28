import { timingSafeEqual } from "node:crypto";
import { Injectable, type ExecutionContext } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
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
 * web↔API sırrı) başlıkta gönderir; eşleşirse hız sınırı ATLANIR.
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
 * ThrottlerGuard — tracker olarak gerçek istemci IP'si (cf-connecting-ip
 * bayrağı açıksa) kullanır; aksi halde varsayılan `req.ip`. Cloudflare
 * arkasında tüm kullanıcıların tek CF IP'sinde toplanıp ortak 429 yemesini
 * (ve per-IP login limitinin anlamsızlaşmasını) kapatır. Web SSR çağrısı
 * (`isTrustedSsrRequest`) sınırdan muaftır.
 */
@Injectable()
export class ClientIpThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(req: Record<string, unknown>): Promise<string> {
    return resolveClientIp(req as IpRequestLike);
  }

  protected override async shouldSkip(context: ExecutionContext): Promise<boolean> {
    if (context.getType() === "http" && isTrustedSsrRequest(context.switchToHttp().getRequest())) return true;
    return super.shouldSkip(context);
  }
}
