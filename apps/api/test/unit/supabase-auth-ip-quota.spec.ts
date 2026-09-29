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
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import { reportToSentry } from "../../src/instrument";
import { SupabaseAuthService } from "../../src/modules/supabase-auth/supabase-auth.service";

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
  it("429 → 503 + Sentry tag supabase=auth_rate_limited", async () => {
    const svc = makeService({ SUPABASE_SECRET_KEY: SECRET });
    nextResponse = () =>
      json(429, { code: 429, error_code: "over_request_rate_limit", msg: "Request rate limit reached" });
    await expect(svc.verifyPassword("e@x.com", "p", "203.0.113.7")).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(reportToSentry).toHaveBeenCalledTimes(1);
    const [, , ctx] = (reportToSentry as jest.Mock).mock.calls[0];
    expect(ctx.tags).toMatchObject({ supabase: "auth_rate_limited", supabase_ip_forwarding: "true" });
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
