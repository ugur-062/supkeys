/**
 * Password reset over REAL HTTP (arayuz testi 2026-10 login-14, login-16):
 * real controllers, the app's throttler guard with the app's storage, the CSRF
 * guard and a ValidationPipe configured like main.ts, on the test database.
 * Only e-mail and Supabase are fakes.
 *
 *  - POST /api/auth/password-reset/check is the ONE address of the link
 *    check: `{ valid }`, read only, 5 per minute per IP, not blocked by a
 *    stale session cookie. The former second address /api/password-reset/check
 *    is gone (404) and has no CSRF exemption.
 *  - POST /api/company-auth/forgot-password answers before the token and the
 *    mail exist, with the same body for a registered and an unknown address.
 */
import "reflect-metadata";
import * as crypto from "node:crypto";
import type { AddressInfo } from "node:net";
import { type INestApplication, Module, ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { APP_GUARD, NestFactory } from "@nestjs/core";
import { ThrottlerModule } from "@nestjs/throttler";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { AUTH_COOKIE } from "../../src/common/auth/cookie";
import { CsrfGuard } from "../../src/common/auth/csrf.guard";
import { SessionRevocationService } from "../../src/common/auth/session-revocation.service";
import { ClientIpThrottlerGuard } from "../../src/common/http/client-ip-throttler.guard";
import { runWithLocale } from "../../src/common/i18n/locale-context";
import { PerKeyThrottlerStorage } from "../../src/common/http/throttler-storage";
import { CompanyAuthController } from "../../src/modules/company-auth/controllers/company-auth.controller";
import { CompanyForgotPasswordDto } from "../../src/modules/company-auth/dto/company-forgot-password.dto";
import { CompanyLoginDto } from "../../src/modules/company-auth/dto/company-login.dto";
import { CompanyAuthService } from "../../src/modules/company-auth/services/company-auth.service";
import { PasswordResetController } from "../../src/modules/password-reset/password-reset.controller";
import { PasswordResetService } from "../../src/modules/password-reset/password-reset.service";
import { RealtimeService } from "../../src/modules/realtime/realtime.service";
import { makeCompanyWithUser } from "./factories";
import { prisma, truncateAll } from "./test-db";

const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

const email = { send: jest.fn() };
const supabaseAuth = { updatePassword: jest.fn().mockResolvedValue(undefined) };
const config = { get: (_key: string, fallback?: unknown) => fallback ?? "http://localhost:3000" };

let app: INestApplication;
let base: string;
let service: PasswordResetService;
const savedTrustCf = process.env.TRUST_CF_CONNECTING_IP;
const savedSameSite = process.env.COOKIE_SAMESITE;

beforeAll(async () => {
  // Every test is its own client: the guard reads the client IP from
  // cf-connecting-ip when this flag is on (production setting).
  process.env.TRUST_CF_CONNECTING_IP = "true";
  // CSRF double-submit enforced, like production (COOKIE_SAMESITE=lax).
  process.env.COOKIE_SAMESITE = "lax";
  service = new PasswordResetService(
    prisma as never,
    email as never,
    config as never,
    supabaseAuth as never,
  );

  @Module({
    imports: [
      ThrottlerModule.forRoot({
        storage: new PerKeyThrottlerStorage(),
        throttlers: [
          { name: "default", ttl: 60_000, limit: 100 },
          { name: "auth", ttl: 60_000, limit: 1000 },
        ],
      }),
    ],
    controllers: [PasswordResetController, CompanyAuthController],
    providers: [
      { provide: PasswordResetService, useValue: service },
      { provide: ConfigService, useValue: config },
      // forgot-password touches none of these.
      { provide: CompanyAuthService, useValue: {} },
      { provide: SessionRevocationService, useValue: {} },
      { provide: RealtimeService, useValue: {} },
      { provide: APP_GUARD, useClass: ClientIpThrottlerGuard },
      { provide: APP_GUARD, useClass: CsrfGuard },
    ],
  })
  class PasswordResetHttpModule {}

  app = await NestFactory.create(PasswordResetHttpModule, { logger: false });
  app.setGlobalPrefix("api");
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );
  await app.listen(0, "127.0.0.1");
  const { port } = app.getHttpServer().address() as AddressInfo;
  base = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await app?.close();
  if (savedTrustCf === undefined) delete process.env.TRUST_CF_CONNECTING_IP;
  else process.env.TRUST_CF_CONNECTING_IP = savedTrustCf;
  if (savedSameSite === undefined) delete process.env.COOKIE_SAMESITE;
  else process.env.COOKIE_SAMESITE = savedSameSite;
  await truncateAll();
  await prisma.$disconnect();
});

let clientSeq = 0;
let clientIp = "";
beforeEach(async () => {
  await service.whenIdle();
  await truncateAll();
  email.send.mockReset().mockResolvedValue({ emailLogId: "t", sent: true });
  clientSeq += 1;
  clientIp = `203.0.113.${clientSeq}`;
});

async function post(
  path: string,
  json: unknown,
  opts: { cookie?: string; ip?: string } = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "cf-connecting-ip": opts.ip ?? clientIp,
      ...(opts.cookie ? { cookie: opts.cookie } : {}),
    },
    body: JSON.stringify(json),
  });
  const text = await res.text();
  let body: Record<string, unknown> = {};
  try {
    body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    body = { raw: text };
  }
  return { status: res.status, body };
}

async function userWithAuth() {
  const owner = await makeCompanyWithUser(prisma, { tier: "GOLD" });
  await prisma.companyUser.update({
    where: { id: owner.user.id },
    data: { authId: `auth-${owner.user.id}` },
  });
  return owner;
}

async function makeToken(userId: string, over: { usedAt?: Date; expiresAt?: Date } = {}) {
  const plain = crypto.randomBytes(32).toString("hex");
  await prisma.passwordResetToken.create({
    data: {
      companyUserId: userId,
      tokenHash: sha256(plain),
      expiresAt: over.expiresAt ?? new Date(Date.now() + 3_600_000),
      usedAt: over.usedAt ?? null,
    },
  });
  return plain;
}

const CHECK_PATH = "/api/auth/password-reset/check";
/** The second address the first version also served. Removed. */
const REMOVED_CHECK_PATH = "/api/password-reset/check";
const CHECK_PATHS = [CHECK_PATH] as const;

describe("POST auth/password-reset/check (login-16)", () => {
  it.each(CHECK_PATHS)("%s: valid link -> 200 { valid: true }, nothing is written", async (path) => {
    const owner = await userWithAuth();
    const token = await makeToken(owner.user.id);
    const before = await prisma.passwordResetToken.findFirstOrThrow();

    const res = await post(path, { token });

    expect(res).toEqual({ status: 200, body: { valid: true } });
    expect(await prisma.passwordResetToken.findFirstOrThrow()).toEqual(before);
    expect(supabaseAuth.updatePassword).not.toHaveBeenCalled();
  });

  it.each(CHECK_PATHS)("%s: unknown, used and expired links -> 200 { valid: false }", async (path) => {
    const owner = await userWithAuth();
    const used = await makeToken(owner.user.id, { usedAt: new Date() });
    const expired = await makeToken(owner.user.id, { expiresAt: new Date(Date.now() - 1000) });
    const unknown = crypto.randomBytes(32).toString("hex");

    expect(await post(path, { token: unknown })).toEqual({
      status: 200,
      body: { valid: false, message: "Geçersiz veya kullanılmış bağlantı" },
    });
    expect(await post(path, { token: used })).toEqual({
      status: 200,
      body: { valid: false, message: "Bu bağlantı zaten kullanılmış" },
    });
    expect(await post(path, { token: expired })).toEqual({
      status: 200,
      body: { valid: false, message: "Bağlantının süresi dolmuş" },
    });
    // Not a token at all: still "no", not a validation error.
    expect((await post(path, { token: "kisa" })).body.valid).toBe(false);
  });

  it("the link that confirm consumed is reported invalid afterwards", async () => {
    const owner = await userWithAuth();
    const token = await makeToken(owner.user.id);

    expect((await post(CHECK_PATH, { token })).body).toEqual({ valid: true });
    const confirm = await post("/api/auth/password-reset/confirm", {
      token,
      newPassword: "Пароль-Секрет1!",
    });
    expect(confirm).toEqual({ status: 200, body: { success: true } });
    expect(supabaseAuth.updatePassword).toHaveBeenCalledWith(`auth-${owner.user.id}`, "Пароль-Секрет1!");
    expect((await post(CHECK_PATH, { token })).body).toEqual({
      valid: false,
      message: "Bu bağlantı zaten kullanılmış",
    });
  });

  it("body shape is validated: missing / non-string / oversized token and extra fields -> 400", async () => {
    for (const body of [{}, { token: 12345 }, { token: "a".repeat(201) }, { token: "x".repeat(64), extra: 1 }]) {
      expect((await post(CHECK_PATH, body)).status).toBe(400);
    }
  });

  it("stale session cookie without a CSRF header does not block the check", async () => {
    const owner = await userWithAuth();
    const token = await makeToken(owner.user.id);
    const cookie = `${AUTH_COOKIE.company}=stale.jwt.value`;
    expect(await post(CHECK_PATH, { token }, { cookie })).toEqual({ status: 200, body: { valid: true } });
  });

  it("rate limit like confirm: 5 per minute per IP", async () => {
    const token = crypto.randomBytes(32).toString("hex");
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      statuses.push((await post(CHECK_PATH, { token })).status);
    }
    expect(statuses).toEqual([200, 200, 200, 200, 200, 429]);
    // confirm has its own counter, and another client is not affected.
    expect((await post("/api/auth/password-reset/confirm", { token, newPassword: "Guclu!Sifre9" })).status).toBe(403);
    expect((await post(CHECK_PATH, { token }, { ip: "198.51.100.77" })).status).toBe(200);
  });

  it("ONE address per endpoint: the removed second check path and a confirm twin are 404", async () => {
    const owner = await userWithAuth();
    const token = await makeToken(owner.user.id);

    // No handler: 404 for a valid link too, and nothing is read or written.
    const removed = await post(REMOVED_CHECK_PATH, { token });
    expect(removed.status).toBe(404);
    expect(removed.body).not.toHaveProperty("valid");

    // Same answer with a (stale) session cookie: there is no route at all.
    // (That the path is no longer CSRF-exempt is locked in csrf-guard.spec.)
    const cookie = `${AUTH_COOKIE.company}=stale.jwt.value`;
    expect((await post(REMOVED_CHECK_PATH, { token }, { cookie })).status).toBe(404);

    // The removed path spent nothing of the real endpoint's limit.
    for (let i = 0; i < 5; i++) {
      expect((await post(CHECK_PATH, { token })).status).toBe(200);
    }

    const res = await post("/api/password-reset/confirm", {
      token: "x".repeat(64),
      newPassword: "Guclu!Sifre9",
    });
    expect(res.status).toBe(404);
  });
});

describe("POST company-auth/forgot-password (login-14)", () => {
  it("answers before the token and the mail exist; the work finishes afterwards", async () => {
    const owner = await userWithAuth();
    let releaseMail!: () => void;
    const mailHeld = new Promise<void>((resolve) => {
      releaseMail = resolve;
    });
    email.send.mockImplementation(async () => {
      await mailHeld;
      return { emailLogId: "t", sent: true };
    });

    // The mail provider is still "sending" (held) when the answer arrives.
    const res = await post("/api/company-auth/forgot-password", { email: owner.user.email });
    expect(res).toEqual({ status: 200, body: { success: true } });

    releaseMail();
    await service.whenIdle();
    expect(email.send).toHaveBeenCalledTimes(1);
    expect(
      await prisma.passwordResetToken.count({ where: { companyUserId: owner.user.id, usedAt: null } }),
    ).toBe(1);
  });

  it("registered and unknown address get the same answer; nothing is produced for the unknown one", async () => {
    const owner = await userWithAuth();

    const known = await post("/api/company-auth/forgot-password", { email: owner.user.email });
    const unknown = await post("/api/company-auth/forgot-password", { email: "yok@firma.com" });
    expect(known).toEqual({ status: 200, body: { success: true } });
    expect(unknown).toEqual(known);

    await service.whenIdle();
    expect(email.send).toHaveBeenCalledTimes(1);
    expect(email.send.mock.calls[0]![0].to.email).toBe(owner.user.email);
    expect(await prisma.passwordResetToken.count()).toBe(1);
  });

  // login-13: the bad-address message was a clipped "Geçerli e-posta girin"
  // while the login form and the login DTO say the full polite sentence.
  it("a malformed address is refused with the same full sentence as on login, in tr / en / ru", async () => {
    const res = await post("/api/company-auth/forgot-password", { email: "a@b" });
    expect(res.status).toBe(400);
    expect(res.body.message).toEqual(["Geçerli bir e-posta adresi giriniz"]);
    await service.whenIdle();
    expect(email.send).not.toHaveBeenCalled();
    expect(await prisma.passwordResetToken.count()).toBe(0);

    const emailMessages = (cls: new () => object, locale: string) =>
      runWithLocale(locale, async () => {
        const errs = await validate(plainToInstance(cls, { email: "a@b", password: "x" }) as object);
        return errs.filter((e) => e.property === "email").flatMap((e) => Object.values(e.constraints ?? {}));
      });
    const expected: Record<string, string> = {
      tr: "Geçerli bir e-posta adresi giriniz",
      en: "Enter a valid email address",
      ru: "Введите корректный адрес электронной почты",
    };
    for (const [locale, sentence] of Object.entries(expected)) {
      const forgot = await emailMessages(CompanyForgotPasswordDto, locale);
      expect({ locale, forgot }).toEqual({ locale, forgot: [sentence] });
      // One wording for the same mistake on both forms.
      expect({ locale, login: await emailMessages(CompanyLoginDto, locale) }).toEqual({ locale, login: forgot });
    }
  });

  it("the link from the mail passes the check and is replaced by a second request", async () => {
    const owner = await userWithAuth();
    const tokenOf = (call: number) =>
      /token=([0-9a-f]{64})/.exec(email.send.mock.calls[call]![0].templateData.data.resetUrl as string)![1]!;

    await post("/api/company-auth/forgot-password", { email: owner.user.email });
    await service.whenIdle();
    const first = tokenOf(0);
    expect((await post(CHECK_PATH, { token: first })).body).toEqual({ valid: true });

    await post("/api/company-auth/forgot-password", { email: owner.user.email });
    await service.whenIdle();
    const second = tokenOf(1);
    expect((await post(CHECK_PATH, { token: first })).body).toMatchObject({ valid: false });
    expect((await post(CHECK_PATH, { token: second })).body).toEqual({ valid: true });
  });
});
