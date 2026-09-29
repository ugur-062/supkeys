/**
 * Derin denetim 2026-09-29 Y-11 + X17 — SupabaseAuthService.
 *
 * Y-11: tüm girişler Supabase GoTrue'ya tek sunucu IP'sinden gidiyordu; IP
 * başına giriş kotası dolunca HERKES 503 alıyordu. Secret anahtar
 * (`SUPABASE_SECRET_KEY`) yapılandırılınca istemci IP'si `Sb-Forwarded-For`
 * ile iletilir; 429 Sentry'e kesintiden ayrı etiketle raporlanır.
 *
 * X17: Supabase zayıf/sızmış parola reddi (422 weak_password) 503 "birazdan
 * tekrar deneyin" yerine 400 + yerelleştirilmiş mesaj döner.
 */
jest.mock("../../src/instrument", () => ({ reportToSentry: jest.fn() }));

import {
  BadRequestException,
  ConflictException,
  HttpException,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import { reportToSentry } from "../../src/instrument";
import { AdminAuthService } from "../../src/modules/admin-auth/admin-auth.service";
import {
  SupabaseAuthService,
  isSupabaseAuthAccessError,
} from "../../src/modules/supabase-auth/supabase-auth.service";

const URL_ = "https://proj.supabase.co";
const ANON = "anon-jwt";
const SERVICE = "service-role-jwt";
const SECRET = "sb_secret_test123";
const USER_ID = "00000000-0000-4000-8000-000000000001";

function makeService(extra: Record<string, string> = {}): SupabaseAuthService {
  const env: Record<string, string> = {
    SUPABASE_URL: URL_,
    SUPABASE_ANON_KEY: ANON,
    SUPABASE_SERVICE_ROLE_KEY: SERVICE,
    ...extra,
  };
  const config = { get: (k: string) => env[k] } as unknown as ConfigService;
  return new SupabaseAuthService(config);
}

type Captured = { url: string; headers: Headers };

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const SESSION = {
  access_token: "at",
  token_type: "bearer",
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  refresh_token: "rt",
  user: { id: "auth-1", email: "e@x.com", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" },
};

let captured: Captured[];
let nextResponse: () => Response;
let fetchSpy: jest.SpyInstance;

beforeEach(() => {
  captured = [];
  nextResponse = () => json(200, SESSION);
  fetchSpy = jest.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    captured.push({ url, headers: new Headers(init?.headers) });
    return nextResponse();
  });
  (reportToSentry as jest.Mock).mockClear();
});
afterEach(() => fetchSpy.mockRestore());

function tokenCall(): Captured {
  const c = captured.find((x) => x.url.includes("/auth/v1/token"));
  if (!c) throw new Error("token isteği yapılmadı");
  return c;
}

describe("Y-11 verifyPassword — istemci IP'si Supabase'e iletilir", () => {
  it("secret anahtar varken: Sb-Forwarded-For = istemci IP'si, apikey = secret anahtar", async () => {
    const svc = makeService({ SUPABASE_SECRET_KEY: SECRET });
    await expect(svc.verifyPassword("e@x.com", "p", "203.0.113.7")).resolves.toEqual({
      authId: "auth-1",
      email: "e@x.com",
    });
    const c = tokenCall();
    expect(c.headers.get("sb-forwarded-for")).toBe("203.0.113.7");
    expect(c.headers.get("apikey")).toBe(SECRET);
  });

  it("IPv6 da iletilir; geçersiz/eksik IP iletilmez (sahte değer gönderilmez)", async () => {
    const svc = makeService({ SUPABASE_SECRET_KEY: SECRET });
    await svc.verifyPassword("e@x.com", "p", "2001:db8::1");
    expect(tokenCall().headers.get("sb-forwarded-for")).toBe("2001:db8::1");

    captured = [];
    await svc.verifyPassword("e@x.com", "p", "unknown");
    expect(tokenCall().headers.get("sb-forwarded-for")).toBeNull();

    captured = [];
    await svc.verifyPassword("e@x.com", "p");
    expect(tokenCall().headers.get("sb-forwarded-for")).toBeNull();
  });

  it("eşzamanlı girişlerde her istek KENDİ IP'sini taşır (AsyncLocalStorage izolasyonu)", async () => {
    const svc = makeService({ SUPABASE_SECRET_KEY: SECRET });
    await Promise.all([
      svc.verifyPassword("a@x.com", "p", "198.51.100.1"),
      svc.verifyPassword("b@x.com", "p", "198.51.100.2"),
    ]);
    const ips = captured
      .filter((x) => x.url.includes("/auth/v1/token"))
      .map((x) => x.headers.get("sb-forwarded-for"))
      .sort();
    expect(ips).toEqual(["198.51.100.1", "198.51.100.2"]);
  });

  it("secret anahtar yokken eski davranış: anon anahtar, başlık YOK", async () => {
    const svc = makeService();
    await svc.verifyPassword("e@x.com", "p", "203.0.113.7");
    const c = tokenCall();
    expect(c.headers.get("sb-forwarded-for")).toBeNull();
    expect(c.headers.get("apikey")).toBe(ANON);
  });

  it("şifre sıfırlama e-postası secret anahtarlı istemciye taşınmaz (anon kalır)", async () => {
    const svc = makeService({ SUPABASE_SECRET_KEY: SECRET });
    nextResponse = () => json(200, {});
    await svc.sendPasswordResetEmail("e@x.com", "https://www.rothern.com/reset");
    const c = captured.find((x) => x.url.includes("/auth/v1/recover"));
    expect(c?.headers.get("apikey")).toBe(ANON);
    expect(c?.headers.get("sb-forwarded-for")).toBeNull();
  });
});

describe("Y-11 verifyPassword — 429 ayrı alarm etiketiyle raporlanır", () => {
  const rateLimit = () =>
    json(429, { code: 429, error_code: "over_request_rate_limit", msg: "Request rate limit reached" });

  it("IP iletilirken 429 = yalnız o istemcinin kotası → 429 'çok fazla deneme' + Sentry warning (error alarmı YOK)", async () => {
    const svc = makeService({ SUPABASE_SECRET_KEY: SECRET });
    nextResponse = rateLimit;
    const err = await svc.verifyPassword("e@x.com", "p", "203.0.113.7").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HttpException);
    expect(err).not.toBeInstanceOf(ServiceUnavailableException);
    expect((err as HttpException).getStatus()).toBe(429);
    expect(((err as HttpException).getResponse() as { i18nKey: string }).i18nKey).toBe("api.http.cokFazlaDeneme");
    expect(reportToSentry).toHaveBeenCalledTimes(1);
    const [, level, ctx] = (reportToSentry as jest.Mock).mock.calls[0];
    expect(level).toBe("warning");
    expect(ctx.tags).toMatchObject({ supabase: "auth_client_rate_limited", supabase_ip_forwarding: "true" });
  });

  it("IP iletilmiyorsa 429 = sunucu IP'sinin PAYLAŞILAN kotası → 503 + Sentry error supabase=auth_rate_limited", async () => {
    // Secret anahtar yok (eski davranış).
    const legacy = makeService();
    nextResponse = rateLimit;
    await expect(legacy.verifyPassword("e@x.com", "p", "203.0.113.7")).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    let [, level, ctx] = (reportToSentry as jest.Mock).mock.calls[0];
    expect(level).toBe("error");
    expect(ctx.tags).toMatchObject({ supabase: "auth_rate_limited", supabase_ip_forwarding: "false" });

    // Secret anahtar var ama istemci IP'si çözülemedi → istek sunucu IP'siyle gitti.
    (reportToSentry as jest.Mock).mockClear();
    const svc = makeService({ SUPABASE_SECRET_KEY: SECRET });
    await expect(svc.verifyPassword("e@x.com", "p", "unknown")).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    [, level, ctx] = (reportToSentry as jest.Mock).mock.calls[0];
    expect(level).toBe("error");
    expect(ctx.tags).toMatchObject({ supabase: "auth_rate_limited" });
  });

  it("5xx → 503 + Sentry tag supabase=auth_unavailable (429'dan ayrı)", async () => {
    const svc = makeService();
    nextResponse = () => json(502, { msg: "bad gateway" });
    await expect(svc.verifyPassword("e@x.com", "p")).rejects.toBeInstanceOf(ServiceUnavailableException);
    const [, , ctx] = (reportToSentry as jest.Mock).mock.calls[0];
    expect(ctx.tags).toMatchObject({ supabase: "auth_unavailable", supabase_ip_forwarding: "false" });
  });

  it("400 kimlik hatası → 401, Sentry'e gitmez", async () => {
    const svc = makeService({ SUPABASE_SECRET_KEY: SECRET });
    nextResponse = () =>
      json(400, { code: 400, error_code: "invalid_credentials", msg: "Invalid login credentials" });
    await expect(svc.verifyPassword("e@x.com", "p", "203.0.113.7")).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(reportToSentry).not.toHaveBeenCalled();
  });
});

describe("B3 gözden geçirme — geçersiz API anahtarı kimlik hatası sayılmaz", () => {
  it("secret anahtar geçersiz/iptal (ağ geçidi 401 'Invalid API key') → 503 + Sentry supabase=auth_misconfigured", async () => {
    const svc = makeService({ SUPABASE_SECRET_KEY: SECRET });
    nextResponse = () =>
      json(401, { message: "Invalid API key", hint: "Double check your Supabase `anon` or `service_role` API key." });
    await expect(svc.verifyPassword("e@x.com", "p", "203.0.113.7")).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(reportToSentry).toHaveBeenCalledTimes(1);
    const [, level, ctx] = (reportToSentry as jest.Mock).mock.calls[0];
    expect(level).toBe("error");
    expect(ctx.tags).toMatchObject({ supabase: "auth_misconfigured", supabase_ip_forwarding: "true" });
  });

  it("secret anahtarla gelen kodsuz 401 (ör. 'Unregistered API key' değişkeni) da yanlış yapılandırmadır", async () => {
    const svc = makeService({ SUPABASE_SECRET_KEY: SECRET });
    nextResponse = () => json(401, { error: "unauthorized" });
    await expect(svc.verifyPassword("e@x.com", "p", "203.0.113.7")).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect((reportToSentry as jest.Mock).mock.calls[0][2].tags.supabase).toBe("auth_misconfigured");
  });

  it("anon anahtar geçersizken de ('Invalid API key') kesinti görünür olur", async () => {
    const svc = makeService();
    nextResponse = () => json(401, { message: "Invalid API key" });
    await expect(svc.verifyPassword("e@x.com", "p")).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect((reportToSentry as jest.Mock).mock.calls[0][2].tags.supabase).toBe("auth_misconfigured");
  });

  it("GoTrue'nun kodlu 401'i hâlâ kimlik hatası (401), Sentry'e gitmez", async () => {
    const svc = makeService({ SUPABASE_SECRET_KEY: SECRET });
    nextResponse = () => json(401, { code: 401, error_code: "invalid_credentials", msg: "Invalid login credentials" });
    await expect(svc.verifyPassword("e@x.com", "p", "203.0.113.7")).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(reportToSentry).not.toHaveBeenCalled();
  });
});

describe("B3 gözden geçirme — çağıranlar 429'u parola hatasına çevirmez", () => {
  it("isSupabaseAuthAccessError: 503 ve 429 erişim hatası; 401/403/400 değil", () => {
    expect(isSupabaseAuthAccessError(new ServiceUnavailableException())).toBe(true);
    expect(isSupabaseAuthAccessError(new HttpException("x", 429))).toBe(true);
    expect(isSupabaseAuthAccessError(new UnauthorizedException())).toBe(false);
    expect(isSupabaseAuthAccessError(new BadRequestException())).toBe(false);
    expect(isSupabaseAuthAccessError(new Error("x"))).toBe(false);
  });

  it("admin girişi: istemci kotası (429) aynen geçer, audit'e bad_credentials YAZILMAZ", async () => {
    const audit = { log: jest.fn() };
    const supabase = {
      verifyPassword: jest.fn().mockRejectedValue(new HttpException("çok fazla deneme", 429)),
    };
    const svc = new AdminAuthService(
      {} as never,
      {} as never,
      supabase as never,
      audit as never,
      {} as never,
    );
    const err = await svc
      .login({ email: "a@x.com", password: "p" } as never, { ip: "203.0.113.7" })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HttpException);
    expect((err as HttpException).getStatus()).toBe(429);
    expect(audit.log).not.toHaveBeenCalled();
  });
});

describe("X17 zayıf/sızmış parola → 400 (503 değil)", () => {
  const pwned = () =>
    json(422, {
      code: 422,
      error_code: "weak_password",
      msg: "Password is known to be weak and easy to guess, please choose a different one.",
      weak_password: { reasons: ["pwned"] },
    });
  const tooShort = () =>
    json(422, {
      code: 422,
      error_code: "weak_password",
      msg: "Password should be at least 12 characters.",
      weak_password: { reasons: ["length"] },
    });

  async function catchErr(p: Promise<unknown>): Promise<unknown> {
    try {
      await p;
    } catch (e) {
      return e;
    }
    throw new Error("hata bekleniyordu");
  }

  it("createUser: sızmış parola → 400 WEAK_PASSWORD + sızıntı mesajı", async () => {
    const svc = makeService();
    nextResponse = pwned;
    const err = await catchErr(svc.createUser("e@x.com", "Password123!"));
    expect(err).toBeInstanceOf(BadRequestException);
    const body = (err as BadRequestException).getResponse() as { i18nKey: string; code: string };
    expect(body.code).toBe("WEAK_PASSWORD");
    expect(body.i18nKey).toBe("api.supabaseAuth.sifreSizintiListelerindeGeciyor");
  });

  it("updatePassword: gereksinim dışı parola → 400 genel zayıf parola mesajı", async () => {
    const svc = makeService();
    nextResponse = tooShort;
    const err = await catchErr(svc.updatePassword(USER_ID, "kisa"));
    expect(err).toBeInstanceOf(BadRequestException);
    const body = (err as BadRequestException).getResponse() as { i18nKey: string };
    expect(body.i18nKey).toBe("api.supabaseAuth.sifreYeterinceGucluDegil");
  });

  it("updatePassword: sızmış parola → 400 sızıntı mesajı", async () => {
    const svc = makeService();
    nextResponse = pwned;
    const err = await catchErr(svc.updatePassword(USER_ID, "Password123!"));
    expect(err).toBeInstanceOf(BadRequestException);
    expect(((err as BadRequestException).getResponse() as { i18nKey: string }).i18nKey).toBe(
      "api.supabaseAuth.sifreSizintiListelerindeGeciyor",
    );
  });

  it("createUser: e-posta çakışması hâlâ 409, kesinti hâlâ 503", async () => {
    const svc = makeService();
    nextResponse = () =>
      json(422, {
        code: 422,
        error_code: "email_exists",
        msg: "A user with this email address has already been registered",
      });
    await expect(svc.createUser("e@x.com", "Guclu-Parola-2026!")).rejects.toBeInstanceOf(ConflictException);

    nextResponse = () => json(503, { msg: "upstream down" });
    await expect(svc.createUser("e@x.com", "Guclu-Parola-2026!")).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    nextResponse = () => json(500, { msg: "db error" });
    await expect(svc.updatePassword(USER_ID, "Guclu-Parola-2026!")).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
