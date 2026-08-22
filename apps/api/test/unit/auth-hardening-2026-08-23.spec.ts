/**
 * Denetim 2026-08-23 Parça 1 (Kimlik & Oturum) — Dalga A birim sözleşmeleri.
 * Her test bir bulguya karşılık gelir (numara raporla aynı).
 */
import type { CallHandler, ExecutionContext } from "@nestjs/common";
import { ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { firstValueFrom, of } from "rxjs";
import { AuthCookieInterceptor } from "../../src/common/auth/auth-cookie.interceptor";
import {
  isAuthCleared,
  markAuthCleared,
  parseCookies,
} from "../../src/common/auth/cookie";
import {
  decryptTotpSecret,
  encryptTotpSecret,
  isEncryptedTotpSecret,
  totpEncKey,
} from "../../src/common/auth/totp-secret-cipher";
import { resolveClientIp } from "../../src/common/http/client-ip";
import { maskSensitiveUrl } from "../../src/common/logging/mask-sensitive-url";
import { scrubRequestPii } from "../../src/instrument";
import { AdminJwtStrategy } from "../../src/modules/admin-auth/strategies/admin-jwt.strategy";
import { SupabaseAuthService } from "../../src/modules/supabase-auth/supabase-auth.service";

const SECRET = "test-secret-hardening";
const jwt = new JwtService({ secret: SECRET, signOptions: { expiresIn: "1h" } });
const config = {
  get: (key: string, def?: unknown) => ({ NODE_ENV: "test" } as Record<string, unknown>)[key] ?? def,
  getOrThrow: (key: string) => {
    if (key === "JWT_SECRET") return SECRET;
    throw new Error(key);
  },
} as unknown as ConfigService;

describe("#1 parseCookies — bozuk yüzde-kodlama patlatmaz", () => {
  it("geçerli değerler decode edilir; bozuk değer HAM kalır; diğer çerezler etkilenmez", () => {
    const out = parseCookies("a=%20x; rk_company=tok.en; bad=%E0%A4%A; worse=%zz; plain=v");
    expect(out.a).toBe(" x");
    expect(out.rk_company).toBe("tok.en");
    expect(out.bad).toBe("%E0%A4%A");
    expect(out.worse).toBe("%zz");
    expect(out.plain).toBe("v");
  });
  it("boş/eksik header → {}", () => {
    expect(parseCookies(undefined)).toEqual({});
    expect(parseCookies("")).toEqual({});
  });
});

function makeCtx(opts: { cookieHeader?: string; body?: unknown; cleared?: "company" | "admin" }) {
  const cookies: { name: string; value: string; options: Record<string, unknown> }[] = [];
  const req = { headers: { cookie: opts.cookieHeader }, body: opts.body ?? {} };
  const res = {
    locals: {} as Record<string, unknown>,
    cookie: (name: string, value: string, options: Record<string, unknown>) =>
      cookies.push({ name, value, options }),
  };
  if (opts.cleared) markAuthCleared(res as never, opts.cleared);
  const ctx = {
    getType: () => "http",
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
  } as unknown as ExecutionContext;
  return { ctx, cookies, res };
}
const nowSec = () => Math.floor(Date.now() / 1000);
const aged = (ageSec: number, extra: object = {}) =>
  jwt.sign({ type: "company", userId: "u1", iat: nowSec() - ageSec, ...extra }, { expiresIn: "1h" });
async function run(ctx: ExecutionContext, body: unknown = {}) {
  const i = new AuthCookieInterceptor(config, jwt);
  return firstValueFrom(i.intercept(ctx, { handle: () => of(body) } as CallHandler));
}

describe("#2 logout + kayan oturum", () => {
  it("yanıt 'auth cleared' işaretliyse yarı-ömrü geçmiş token'a rağmen SLIDE YAPILMAZ", async () => {
    const { ctx, cookies } = makeCtx({ cookieHeader: `rk_company=${aged(45 * 60)}`, cleared: "company" });
    await run(ctx);
    expect(cookies).toHaveLength(0);
  });
  it("işaret yoksa aynı token slide edilir (regresyon korunur)", async () => {
    const { ctx, cookies } = makeCtx({ cookieHeader: `rk_company=${aged(45 * 60)}` });
    await run(ctx);
    expect(cookies.map((c) => c.name)).toEqual(["rk_company", "rk_csrf"]);
  });
  it("markAuthCleared / isAuthCleared realm bazlı", () => {
    const res = { locals: {} } as never;
    markAuthCleared(res, "admin");
    expect(isAuthCleared(res, "admin")).toBe(true);
    expect(isAuthCleared(res, "company")).toBe(false);
  });
});

describe("LOW 'oturumu açık bırak' tercihi token dönen akışlarda korunur", () => {
  it("mevcut cookie persistent=false iken body rememberMe yoksa yeni cookie de SESSION (maxAge yok)", async () => {
    const existing = aged(60, { persistent: false });
    const fresh = jwt.sign({ type: "company", userId: "u1" });
    const { ctx, cookies } = makeCtx({ cookieHeader: `rk_company=${existing}` });
    await run(ctx, { token: fresh });
    const auth = cookies.find((c) => c.name === "rk_company")!;
    expect(auth.options.maxAge).toBeUndefined();
  });
  it("body rememberMe=true açıkça verilirse kalıcı", async () => {
    const existing = aged(60, { persistent: false });
    const fresh = jwt.sign({ type: "company", userId: "u1" });
    const { ctx, cookies } = makeCtx({ cookieHeader: `rk_company=${existing}`, body: { rememberMe: true } });
    await run(ctx, { token: fresh });
    expect(cookies.find((c) => c.name === "rk_company")!.options.maxAge).toBeDefined();
  });
});

describe("#7 resolveClientIp", () => {
  it("bayrak açık + cf-connecting-ip geçerli → o IP; geçersiz/yoksa req.ip", () => {
    expect(resolveClientIp({ headers: { "cf-connecting-ip": "203.0.113.9" }, ip: "172.71.1.1" }, { trustCf: true })).toBe("203.0.113.9");
    expect(resolveClientIp({ headers: { "cf-connecting-ip": "not-an-ip" }, ip: "172.71.1.1" }, { trustCf: true })).toBe("172.71.1.1");
    expect(resolveClientIp({ headers: {}, ip: "172.71.1.1" }, { trustCf: true })).toBe("172.71.1.1");
  });
  it("bayrak kapalı → sahte cf-connecting-ip YOK SAYILIR (CF'siz kurulumda spoof kapısı yok)", () => {
    expect(resolveClientIp({ headers: { "cf-connecting-ip": "203.0.113.9" }, ip: "10.0.0.5" }, { trustCf: false })).toBe("10.0.0.5");
  });
});

describe("#6 maskSensitiveUrl", () => {
  it("path token'ı ve query token/code değerleri maskelenir; diğerleri aynen", () => {
    expect(maskSensitiveUrl("/api/company/invitations/0123456789abcdef0123456789abcdef")).toBe("/api/company/invitations/[redacted]");
    expect(maskSensitiveUrl("/api/company/invitations/0123456789abcdef0123456789abcdef/accept")).toBe("/api/company/invitations/[redacted]/accept");
    expect(maskSensitiveUrl("/api/public/referral-optout?token=abcDEF123&x=1")).toBe("/api/public/referral-optout?token=[redacted]&x=1");
    expect(maskSensitiveUrl("/api/company/listings/clx123?page=2")).toBe("/api/company/listings/clx123?page=2");
    expect(maskSensitiveUrl(undefined)).toBe("");
  });
});

describe("#4 TOTP sırrı şifreleme (ortak yardımcı)", () => {
  it("round-trip + legacy düz metin şeffaf + TOTP_ENC_KEY anahtarı ayrıştırır", () => {
    const k1 = totpEncKey({ jwtSecret: "s1" });
    const enc = encryptTotpSecret("JBSWY3DPEHPK3PXP", k1);
    expect(isEncryptedTotpSecret(enc)).toBe(true);
    expect(decryptTotpSecret(enc, k1)).toBe("JBSWY3DPEHPK3PXP");
    expect(decryptTotpSecret("PLAINLEGACY", k1)).toBe("PLAINLEGACY");
    const k2 = totpEncKey({ jwtSecret: "s1", totpEncKey: "dedicated" });
    expect(() => decryptTotpSecret(enc, k2)).toThrow();
    // JWT_SECRET türevi anahtar, TOTP_ENC_KEY ile aynı değerde olsa bile farklı (önek ayrımı)
    expect(totpEncKey({ jwtSecret: "x" }).equals(totpEncKey({ jwtSecret: "y", totpEncKey: "x" }))).toBe(false);
  });
});

describe("#5 Sentry scrubRequestPii", () => {
  it("cookies/headers/data düşer, url/method kalır", () => {
    const ev = scrubRequestPii({
      request: { url: "/x", method: "POST", cookies: { rk_company: "jwt" }, headers: { cookie: "a" }, data: { password: "p" } },
    });
    expect(ev.request).toEqual({ url: "/x", method: "POST" });
  });
});

describe("#3 AdminJwtStrategy tokenVersion kapısı", () => {
  const mk = (tokenVersion: number) =>
    new AdminJwtStrategy(config, {
      platformAdmin: {
        findUnique: jest.fn(async () => ({ id: "a1", email: "a@x", firstName: "A", lastName: "B", role: "SUPER_ADMIN", isActive: true, tokenVersion })),
      },
    } as never);
  it("tv eşleşiyorsa geçer; eşleşmiyorsa 401; tv claim'siz eski token yalnız tokenVersion=0 iken geçer", async () => {
    await expect(mk(1).validate({ sub: "a1", email: "a@x", role: "SUPER_ADMIN", type: "admin", tv: 1 })).resolves.toMatchObject({ id: "a1" });
    await expect(mk(1).validate({ sub: "a1", email: "a@x", role: "SUPER_ADMIN", type: "admin", tv: 0 })).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(mk(0).validate({ sub: "a1", email: "a@x", role: "SUPER_ADMIN", type: "admin" })).resolves.toMatchObject({ id: "a1" });
    await expect(mk(2).validate({ sub: "a1", email: "a@x", role: "SUPER_ADMIN", type: "admin" })).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

describe("#10 SupabaseAuthService.verifyPassword hata sınıfı", () => {
  function svcWith(error: { status?: number; message: string; name?: string } | null) {
    const s = Object.create(SupabaseAuthService.prototype) as SupabaseAuthService;
    (s as unknown as { logger: { debug: () => void; error: () => void } }).logger = { debug: () => undefined, error: () => undefined };
    (s as unknown as { publicClient: unknown }).publicClient = {
      auth: { signInWithPassword: async () => ({ data: { user: error ? null : { id: "auth-1", email: "e@x" } }, error }) },
    };
    return s;
  }
  it("400/401/403/422 → 401 (parola hatalı)", async () => {
    for (const status of [400, 401, 403, 422]) {
      await expect(svcWith({ status, message: "Invalid login credentials" }).verifyPassword("e@x", "p")).rejects.toBeInstanceOf(UnauthorizedException);
    }
  });
  it("429 / 5xx / ağ (status 0) → 503 ServiceUnavailable (kesinti ≠ parola hatası)", async () => {
    for (const status of [429, 500, 502, 503, 0, undefined]) {
      await expect(svcWith({ status, message: "fetch failed", name: "AuthRetryableFetchError" }).verifyPassword("e@x", "p")).rejects.toBeInstanceOf(ServiceUnavailableException);
    }
  });
  it("başarı → authId", async () => {
    await expect(svcWith(null).verifyPassword("e@x", "p")).resolves.toEqual({ authId: "auth-1", email: "e@x" });
  });
});
