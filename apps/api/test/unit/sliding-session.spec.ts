/**
 * Kayan oturum (sliding session) sözleşmesi — AuthCookieInterceptor:
 *  - Login yanıtı: token `persistent` claim'iyle yeniden imzalanıp cookie'ye
 *    yazılır (rememberMe=false → session cookie, maxAge yok).
 *  - Slide: cookie'deki geçerli token ömrünün yarısını geçtiyse taze token
 *    basılır; CSRF DEĞERİ korunur; persistent:false ise session cookie.
 *  - Genç/expired token'a dokunulmaz.
 */
import type { CallHandler, ExecutionContext } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { firstValueFrom, of } from "rxjs";
import { AuthCookieInterceptor } from "../../src/common/auth/auth-cookie.interceptor";
import { shouldSlide } from "../../src/common/auth/cookie";

const SECRET = "test-secret";
const jwt = new JwtService({
  secret: SECRET,
  signOptions: { expiresIn: "1h" },
});

const config = {
  get: (key: string, def?: unknown) =>
    ({ NODE_ENV: "test" } as Record<string, unknown>)[key] ?? def,
  getOrThrow: (key: string) => {
    if (key === "JWT_SECRET") return SECRET;
    throw new Error(key);
  },
} as unknown as ConfigService;

interface CookieCall {
  name: string;
  value: string;
  options: Record<string, unknown>;
}

function makeCtx(opts: { cookieHeader?: string; body?: unknown }) {
  const cookies: CookieCall[] = [];
  const req = { headers: { cookie: opts.cookieHeader }, body: opts.body ?? {} };
  const res = {
    cookie: (name: string, value: string, options: Record<string, unknown>) =>
      cookies.push({ name, value, options }),
  };
  const ctx = {
    getType: () => "http",
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
  } as unknown as ExecutionContext;
  return { ctx, cookies };
}

async function run(
  ctx: ExecutionContext,
  responseBody: unknown = {},
): Promise<unknown> {
  const interceptor = new AuthCookieInterceptor(config, jwt);
  const next = { handle: () => of(responseBody) } as CallHandler;
  return firstValueFrom(interceptor.intercept(ctx, next));
}

const nowSec = () => Math.floor(Date.now() / 1000);

/** iat'i geçmişe kurup ttl'i sabitler — jsonwebtoken exp'i iat'ten hesaplar. */
function tokenAged(ageSec: number, ttl: string, extra: object = {}) {
  return jwt.sign(
    { type: "company", userId: "u1", iat: nowSec() - ageSec, ...extra },
    { expiresIn: ttl },
  );
}

describe("shouldSlide", () => {
  it("ömrün yarısı geçince true, öncesinde false", () => {
    const now = 1_000_000;
    expect(shouldSlide(now - 10, now + 90 - 10, now)).toBe(false); // %11
    expect(shouldSlide(now - 60, now + 40, now)).toBe(true); // %60
    expect(shouldSlide(undefined, now + 100, now)).toBe(false);
    expect(shouldSlide(now, now, now)).toBe(false); // ttl 0
  });
});

describe("AuthCookieInterceptor", () => {
  it("login: rememberMe=false → persistent:false claim'li token, session cookie (maxAge yok)", async () => {
    const token = jwt.sign({ type: "company", userId: "u1" });
    const { ctx, cookies } = makeCtx({ body: { rememberMe: false } });

    await run(ctx, { token });

    const auth = cookies.find((c) => c.name === "rk_company");
    expect(auth).toBeDefined();
    const claims = jwt.verify<{ persistent?: boolean }>(auth!.value);
    expect(claims.persistent).toBe(false);
    expect(auth!.options.maxAge).toBeUndefined();
  });

  it("login: rememberMe yok → kalıcı cookie (maxAge var) + persistent:true", async () => {
    const token = jwt.sign({ type: "company", userId: "u1" });
    const { ctx, cookies } = makeCtx({ body: {} });

    await run(ctx, { token });

    const auth = cookies.find((c) => c.name === "rk_company");
    expect(jwt.verify<{ persistent?: boolean }>(auth!.value).persistent).toBe(
      true,
    );
    expect(auth!.options.maxAge).toBeGreaterThan(0);
  });

  it("slide: yarı ömrü geçmiş token yenilenir, CSRF değeri korunur", async () => {
    const old = tokenAged(45 * 60, "1h"); // 60dk ömrün 45. dakikası
    const { ctx, cookies } = makeCtx({
      cookieHeader: `rk_company=${old}; rk_csrf=keepme`,
    });

    await run(ctx);

    const auth = cookies.find((c) => c.name === "rk_company");
    expect(auth).toBeDefined();
    expect(auth!.value).not.toBe(old);
    const claims = jwt.verify<{ exp: number; userId: string }>(auth!.value);
    expect(claims.userId).toBe("u1");
    expect(claims.exp).toBeGreaterThan(nowSec() + 3000); // taze ~1h
    const csrf = cookies.find((c) => c.name === "rk_csrf");
    expect(csrf!.value).toBe("keepme");
  });

  it("slide: persistent:false claim → session cookie ile yenilenir", async () => {
    const old = tokenAged(45 * 60, "1h", { persistent: false });
    const { ctx, cookies } = makeCtx({
      cookieHeader: `rk_company=${old}; rk_csrf=x`,
    });

    await run(ctx);

    const auth = cookies.find((c) => c.name === "rk_company");
    expect(auth!.options.maxAge).toBeUndefined();
    expect(
      jwt.verify<{ persistent?: boolean }>(auth!.value).persistent,
    ).toBe(false);
  });

  it("genç token'a dokunmaz", async () => {
    const young = tokenAged(5 * 60, "1h");
    const { ctx, cookies } = makeCtx({
      cookieHeader: `rk_company=${young}; rk_csrf=x`,
    });

    await run(ctx);
    expect(cookies).toHaveLength(0);
  });

  it("süresi dolmuş token'a dokunmaz (guard 401 versin)", async () => {
    const dead = tokenAged(2 * 60 * 60, "1h");
    const { ctx, cookies } = makeCtx({
      cookieHeader: `rk_company=${dead}; rk_csrf=x`,
    });

    await run(ctx);
    expect(cookies).toHaveLength(0);
  });
});
