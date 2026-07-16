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
