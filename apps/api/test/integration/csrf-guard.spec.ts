import type { ExecutionContext } from "@nestjs/common";

import {
  AUTH_COOKIE,
  CSRF_COOKIE,
} from "../../src/common/auth/cookie";
import { CsrfGuard } from "../../src/common/auth/csrf.guard";

/**
 * CsrfGuard davranış teyidi (unit). Guard `process.env.COOKIE_SAMESITE` +
 * `NODE_ENV` okur. Test env NODE_ENV="test" → COOKIE_SAMESITE boşsa effective
 * "lax" (enforce). Bu suite item 1'in çekirdek iddiasını kilitler:
 *  - lax + auth cookie + header YOK/BOŞ → 403 (fail-closed)
 *  - lax + geçerli double-submit → geçer
 *  - none (prod-default açığı) → guard KOMPLE bypass (belgeler)
 */
function ctx(
  method: string,
  path: string,
  cookieHeader?: string,
  csrfHeader?: string,
): ExecutionContext {
  const headers: Record<string, string> = {};
  if (cookieHeader) headers.cookie = cookieHeader;
  if (csrfHeader !== undefined) headers["x-csrf-token"] = csrfHeader;
  const req = { method, path, headers };
  return {
    getType: () => "http",
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

const guard = new CsrfGuard();
const TOKEN = "a".repeat(32);
const authCookie = (csrf?: string) =>
  `${AUTH_COOKIE.company}=jwt.jwt.jwt${csrf ? `; ${CSRF_COOKIE.company}=${csrf}` : ""}`;

describe("CsrfGuard — double-submit fail-closed (SameSite=lax)", () => {
  const saved = process.env.COOKIE_SAMESITE;
  beforeEach(() => {
    delete process.env.COOKIE_SAMESITE; // test env → effective "lax" (enforce)
  });
  afterAll(() => {
    if (saved === undefined) delete process.env.COOKIE_SAMESITE;
    else process.env.COOKIE_SAMESITE = saved;
  });

  it("auth cookie + CSRF header YOK → 403 (fail-closed)", () => {
    expect(() =>
      guard.canActivate(ctx("POST", "/company/listings", authCookie(TOKEN))),
    ).toThrow(/CSRF/);
  });

  it("auth cookie + CSRF header BOŞ → 403", () => {
    expect(() =>
      guard.canActivate(
        ctx("POST", "/company/listings", authCookie(TOKEN), ""),
      ),
    ).toThrow(/CSRF/);
  });

  it("geçerli double-submit (header == cookie) → geçer", () => {
    expect(
      guard.canActivate(
        ctx("POST", "/company/listings", authCookie(TOKEN), TOKEN),
      ),
    ).toBe(true);
  });

  it("header ≠ cookie → 403", () => {
    expect(() =>
      guard.canActivate(
        ctx("POST", "/company/listings", authCookie(TOKEN), "wrong"),
      ),
    ).toThrow(/CSRF/);
  });

  it("GET (safe method) → muaf", () => {
    expect(
      guard.canActivate(ctx("GET", "/company/listings", authCookie(TOKEN))),
    ).toBe(true);
  });

  it("auth cookie YOK → muaf (korunacak oturum yok)", () => {
    expect(guard.canActivate(ctx("POST", "/company/listings"))).toBe(true);
  });

  it("login yolu (ön-oturum) → header'sız muaf", () => {
    expect(
      guard.canActivate(ctx("POST", "/api/company-auth/login")),
    ).toBe(true);
  });

  // D-349: bayat rk_company var, rk_csrf yok → token'lı ön-oturum uçları düşmez.
  it("şifre sıfırlama onayı bayat çerezle header'sız muaf (D-349)", () => {
    expect(
      guard.canActivate(ctx("POST", "/api/auth/password-reset/confirm", authCookie())),
    ).toBe(true);
  });

  // Arayüz testi 2026-10 login-16: sayfa açılırken sorulan bağlantı denetimi
  // de token'la çalışan ön-oturum ucudur — bayat çerez 403'e düşürmemeli
  // (web 403'ü "bilinmiyor" sayıp formu açar, denetim boşa giderdi).
  // TEK ADRES: `auth/password-reset/check`. İlk sürümdeki ikinci adres
  // (`password-reset/check`) kaldırıldı; muafiyet listesinde de yok.
  it("şifre sıfırlama bağlantı denetimi bayat çerezle header'sız muaf — yalnız tek adresi (login-16)", () => {
    for (const path of ["/api/auth/password-reset/check", "/auth/password-reset/check"]) {
      expect(guard.canActivate(ctx("POST", path, authCookie()))).toBe(true);
    }
    // Kaldırılan ikinci adres ve benzer yollar muaf DEĞİL.
    for (const path of [
      "/api/password-reset/check",
      "/password-reset/check",
      "/api/auth/password-reset/check/extra",
      "/api/password-reset/check/extra",
      "/api/company/password-reset/check",
      "/api/company/auth/password-reset/check",
      "/api/password-reset/confirm-all",
    ]) {
      expect(() => guard.canActivate(ctx("POST", path, authCookie()))).toThrow(/CSRF/);
    }
  });

  it("üye daveti kabulü bayat çerezle header'sız muaf (D-349)", () => {
    expect(
      guard.canActivate(
        ctx("POST", `/api/company/invitations/${"f".repeat(64)}/accept`, authCookie()),
      ),
    ).toBe(true);
  });

  it("oturumlu benzer uçlar muaf DEĞİL (bağlantı/sipariş kabulü)", () => {
    expect(() =>
      guard.canActivate(ctx("POST", "/api/company/connections/abc/accept", authCookie(TOKEN))),
    ).toThrow(/CSRF/);
    expect(() =>
      guard.canActivate(
        ctx("POST", "/api/company/connections/invitations/abc/accept", authCookie(TOKEN)),
      ),
    ).toThrow(/CSRF/);
  });
});

describe("CsrfGuard — SameSite=none prod-default açığı (belgeler)", () => {
  const saved = process.env.COOKIE_SAMESITE;
  beforeEach(() => {
    process.env.COOKIE_SAMESITE = "none";
  });
  afterAll(() => {
    if (saved === undefined) delete process.env.COOKIE_SAMESITE;
    else process.env.COOKIE_SAMESITE = saved;
  });

  it("none → auth cookie + header YOK olsa bile guard KOMPLE bypass (true)", () => {
    // Bu, kapatılması gereken açığı BELGELER: none modunda double-submit hiç
    // çalışmaz; koruma CORS'a devredilir (launch-checklist CSRF sırası).
    expect(
      guard.canActivate(ctx("POST", "/company/listings", authCookie(TOKEN))),
    ).toBe(true);
  });
});
