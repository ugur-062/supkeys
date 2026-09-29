import { Reflector } from "@nestjs/core";
import { ThrottlerException, ThrottlerStorageService } from "@nestjs/throttler";
import {
  ClientIpThrottlerGuard,
  DEFAULT_SSR_LIMIT,
  SSR_KEY_HEADER,
  isTrustedSsrRequest,
  ssrBucketLimit,
} from "../../src/common/http/client-ip-throttler.guard";

/**
 * Web SSR → API hız sınırı muafiyeti (yayın denetimi 2026-09-28 Bölüm 11):
 * Vercel'in birkaç çıkış IP'si IP başına 100/dk tavanına düşmesin. Muafiyet
 * DAR: paylaşılan sır (SEO_REVALIDATE_SECRET) ∧ GET ∧ /api/public/*.
 */
const SECRET = "s".repeat(32);
const req = (over: Record<string, unknown> = {}) => ({
  method: "GET",
  originalUrl: "/api/public/products?page=2",
  headers: { [SSR_KEY_HEADER]: SECRET },
  ...over,
});

describe("isTrustedSsrRequest", () => {
  it("doğru sır + GET + /api/public/* → muaf", () => {
    expect(isTrustedSsrRequest(req(), SECRET)).toBe(true);
    expect(isTrustedSsrRequest(req({ headers: { [SSR_KEY_HEADER]: [SECRET] } }), SECRET)).toBe(true);
  });
  it("sır tanımsız/kısa → hiçbir istek muaf değil (bugünkü davranış)", () => {
    expect(isTrustedSsrRequest(req(), undefined)).toBe(false);
    expect(isTrustedSsrRequest(req({ headers: { [SSR_KEY_HEADER]: "short" } }), "short")).toBe(false);
  });
  it("yanlış/eksik başlık, yazma isteği ya da herkese açık olmayan uç → muaf değil", () => {
    expect(isTrustedSsrRequest(req({ headers: { [SSR_KEY_HEADER]: "x".repeat(32) } }), SECRET)).toBe(false);
    expect(isTrustedSsrRequest(req({ headers: {} }), SECRET)).toBe(false);
    expect(isTrustedSsrRequest(req({ method: "POST" }), SECRET)).toBe(false);
    expect(isTrustedSsrRequest(req({ originalUrl: "/api/company-auth/login" }), SECRET)).toBe(false);
    expect(isTrustedSsrRequest(req({ originalUrl: "/api/publicx/../company" }), SECRET)).toBe(false);
  });
});

/**
 * Derin denetim MU-12 (X16): the SSR secret no longer skips throttling — every
 * trusted SSR request counts against ONE finite shared bucket, so random query
 * strings / `?onizleme=1` (data-cache misses) cannot drive unbounded API load.
 */
describe("ClientIpThrottlerGuard — SSR bucket", () => {
  const OLD_ENV = { ...process.env };
  afterEach(() => {
    process.env = { ...OLD_ENV };
  });

  class ProductsCtrl {
    list() {}
    facets() {}
  }

  function ctx(request: Record<string, unknown>, handler: () => void) {
    const res = { header: jest.fn() };
    return {
      getType: () => "http",
      getHandler: () => handler,
      getClass: () => ProductsCtrl,
      switchToHttp: () => ({ getRequest: () => request, getResponse: () => res }),
    } as unknown as import("@nestjs/common").ExecutionContext;
  }

  async function makeGuard() {
    const storage = new ThrottlerStorageService();
    const guard = new ClientIpThrottlerGuard(
      {
        throttlers: [
          { name: "default", ttl: 60_000, limit: 100 },
          { name: "auth", ttl: 60_000, limit: 1000 },
        ],
      },
      storage,
      new Reflector(),
    );
    await guard.onModuleInit();
    return { guard, storage };
  }

  it("trusted SSR request is limited by the shared SSR bucket (across endpoints)", async () => {
    process.env.SEO_REVALIDATE_SECRET = SECRET;
    process.env.THROTTLE_SSR_LIMIT = "3";
    const { guard, storage } = await makeGuard();
    const ssr = { ...req(), ip: "1.2.3.4" };
    await expect(guard.canActivate(ctx(ssr, ProductsCtrl.prototype.list))).resolves.toBe(true);
    await expect(guard.canActivate(ctx({ ...ssr, ip: "5.6.7.8" }, ProductsCtrl.prototype.facets))).resolves.toBe(true);
    await expect(guard.canActivate(ctx(ssr, ProductsCtrl.prototype.list))).resolves.toBe(true);
    // 4th call from any Vercel IP, any public endpoint → 429.
    await expect(guard.canActivate(ctx(ssr, ProductsCtrl.prototype.facets))).rejects.toBeInstanceOf(ThrottlerException);
    storage.onApplicationShutdown();
  });

  it("SSR bucket does not consume the per-IP bucket; untrusted request still uses it", async () => {
    process.env.SEO_REVALIDATE_SECRET = SECRET;
    process.env.THROTTLE_SSR_LIMIT = "1000";
    const { guard, storage } = await makeGuard();
    const ssr = { ...req(), ip: "1.2.3.4" };
    for (let i = 0; i < 150; i++) await guard.canActivate(ctx(ssr, ProductsCtrl.prototype.list));
    const anon = { ...req({ headers: {} }), ip: "1.2.3.4" };
    for (let i = 0; i < 100; i++) await guard.canActivate(ctx(anon, ProductsCtrl.prototype.list));
    await expect(guard.canActivate(ctx(anon, ProductsCtrl.prototype.list))).rejects.toBeInstanceOf(ThrottlerException);
    storage.onApplicationShutdown();
  });

  it("ssrBucketLimit: env override, invalid → default", () => {
    expect(ssrBucketLimit(undefined)).toBe(DEFAULT_SSR_LIMIT);
    expect(ssrBucketLimit("abc")).toBe(DEFAULT_SSR_LIMIT);
    expect(ssrBucketLimit("0")).toBe(DEFAULT_SSR_LIMIT);
    expect(ssrBucketLimit("8000")).toBe(8000);
  });
});
