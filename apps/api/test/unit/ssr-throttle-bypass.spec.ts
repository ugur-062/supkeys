import { Reflector } from "@nestjs/core";
import { ThrottlerException, ThrottlerStorageService } from "@nestjs/throttler";
import {
  ClientIpThrottlerGuard,
  DEFAULT_SSR_CLIENT_LIMIT,
  DEFAULT_SSR_LIMIT,
  SSR_CLIENT_IP_HEADER,
  SSR_KEY_HEADER,
  isTrustedSsrRequest,
  ssrBucketLimit,
  ssrClientIp,
  ssrClientLimit,
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

  /**
   * Review follow-up: the global bucket alone let ONE visitor flooding
   * `/urunler?q=<random>` / `?onizleme=1` exhaust it and 429 every other
   * visitor's SSR. Attributed requests (dynamic renders) get their own bucket.
   */
  it("attributed SSR request uses a per-visitor bucket and never drains the global one", async () => {
    process.env.SEO_REVALIDATE_SECRET = SECRET;
    process.env.THROTTLE_SSR_LIMIT = "3";
    process.env.THROTTLE_PUBLIC_LIMIT = "5";
    const { guard, storage } = await makeGuard();
    const attacker = { ...req({ headers: { [SSR_KEY_HEADER]: SECRET, [SSR_CLIENT_IP_HEADER]: "9.9.9.9" } }), ip: "1.2.3.4" };
    for (let i = 0; i < 5; i++) {
      await expect(
        guard.canActivate(ctx(attacker, i % 2 ? ProductsCtrl.prototype.facets : ProductsCtrl.prototype.list)),
      ).resolves.toBe(true);
    }
    // 6th call from the same visitor (any public endpoint) → 429.
    await expect(guard.canActivate(ctx(attacker, ProductsCtrl.prototype.list))).rejects.toBeInstanceOf(ThrottlerException);
    // Another visitor and ISR renders are unaffected.
    const other = { ...req({ headers: { [SSR_KEY_HEADER]: SECRET, [SSR_CLIENT_IP_HEADER]: "8.8.8.8" } }), ip: "1.2.3.4" };
    await expect(guard.canActivate(ctx(other, ProductsCtrl.prototype.list))).resolves.toBe(true);
    const isr = { ...req(), ip: "1.2.3.4" };
    for (let i = 0; i < 3; i++) await expect(guard.canActivate(ctx(isr, ProductsCtrl.prototype.list))).resolves.toBe(true);
    storage.onApplicationShutdown();
  });

  it("client IP header without a valid secret is ignored (plain per-IP bucket)", async () => {
    process.env.SEO_REVALIDATE_SECRET = SECRET;
    const { guard, storage } = await makeGuard();
    for (let i = 0; i < 100; i++) {
      const spoof = { ...req({ headers: { [SSR_CLIENT_IP_HEADER]: `10.0.0.${i}` } }), ip: "1.2.3.4" };
      await guard.canActivate(ctx(spoof, ProductsCtrl.prototype.list));
    }
    const next = { ...req({ headers: { [SSR_CLIENT_IP_HEADER]: "10.0.1.1" } }), ip: "1.2.3.4" };
    await expect(guard.canActivate(ctx(next, ProductsCtrl.prototype.list))).rejects.toBeInstanceOf(ThrottlerException);
    storage.onApplicationShutdown();
  });

  it("ssrClientIp: only literal IPs; ssrClientLimit: env override, invalid → default", () => {
    expect(ssrClientIp({ headers: { [SSR_CLIENT_IP_HEADER]: " 203.0.113.7 " } })).toBe("203.0.113.7");
    expect(ssrClientIp({ headers: { [SSR_CLIENT_IP_HEADER]: ["2001:db8::1"] } })).toBe("2001:db8::1");
    expect(ssrClientIp({ headers: { [SSR_CLIENT_IP_HEADER]: "not-an-ip" } })).toBeUndefined();
    expect(ssrClientIp({ headers: { [SSR_CLIENT_IP_HEADER]: "1.2.3.4, 5.6.7.8" } })).toBeUndefined();
    expect(ssrClientIp({ headers: {} })).toBeUndefined();
    expect(ssrClientLimit(undefined)).toBe(DEFAULT_SSR_CLIENT_LIMIT);
    expect(ssrClientLimit("-1")).toBe(DEFAULT_SSR_CLIENT_LIMIT);
    expect(ssrClientLimit("900")).toBe(900);
  });

  it("ssrBucketLimit: env override, invalid → default", () => {
    expect(ssrBucketLimit(undefined)).toBe(DEFAULT_SSR_LIMIT);
    expect(ssrBucketLimit("abc")).toBe(DEFAULT_SSR_LIMIT);
    expect(ssrBucketLimit("0")).toBe(DEFAULT_SSR_LIMIT);
    expect(ssrBucketLimit("8000")).toBe(8000);
  });
});
