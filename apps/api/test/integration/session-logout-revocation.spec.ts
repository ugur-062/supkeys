/**
 * OTURUM BAZLI İPTAL (canlı öncesi sağlamlaştırma H2, 2026-10-07 — sahip
 * kararı 2026-10-05): çıkışta YALNIZ o oturum sunucuda iptal edilir.
 *
 * Önceki durum (canlıda ölçüldü): çıkış yalnız çerezi siliyordu, aynı JWT
 * 7 güne kadar /me'den 200 almayı sürdürüyordu.
 *
 * Sözleşme GERÇEK HTTP üzerinden sınanır (gerçek denetleyiciler, passport
 * stratejileri, AuthCookieInterceptor, test veritabanı) — yalnız Supabase /
 * e-posta / denetim günlüğü sahte:
 *  - çıkış → aynı çerez /me'de 401; aynı kullanıcının öteki oturumu 200
 *  - jti'siz eski jeton kabul edilir (iptal edilemez, ömrü dolana dek geçer)
 *  - iptal edilmiş oturum kapısız uçta kayan yenilemeyle DİRİLMEZ
 *  - /rt geçidi iptal edilmiş oturumu bağlamaz
 *  - gece temizliği süresi geçen satırları siler
 *  - admin realm'i aynı
 */
import "reflect-metadata";
import type { AddressInfo } from "node:net";
import { type INestApplication, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { APP_INTERCEPTOR, NestFactory } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import type { Socket } from "socket.io";
import { AuthCookieInterceptor } from "../../src/common/auth/auth-cookie.interceptor";
import { SessionRevocationScheduler } from "../../src/common/auth/session-revocation.scheduler";
import { SessionRevocationService } from "../../src/common/auth/session-revocation.service";
import { PrismaBypassService } from "../../src/common/prisma/prisma.service";
import { AdminAuthController } from "../../src/modules/admin-auth/admin-auth.controller";
import { AdminAuthService } from "../../src/modules/admin-auth/admin-auth.service";
import { AdminJwtStrategy } from "../../src/modules/admin-auth/strategies/admin-jwt.strategy";
import { CompanyAuthController } from "../../src/modules/company-auth/controllers/company-auth.controller";
import { CompanyAuthService } from "../../src/modules/company-auth/services/company-auth.service";
import { CompanyJwtStrategy } from "../../src/modules/company-auth/strategies/company-jwt.strategy";
import { PasswordResetService } from "../../src/modules/password-reset/password-reset.service";
import { RealtimeGateway } from "../../src/modules/realtime/realtime.gateway";
import { RealtimeService } from "../../src/modules/realtime/realtime.service";
import { extractCode, makeAuthService } from "./make-auth-service";
import { prisma, truncateAll } from "./test-db";

// makeAuthService'in imzaladığı sır — stratejiler ve interceptor aynısını okur.
const SECRET = "test-secret";
const DAY_MS = 24 * 60 * 60 * 1000;
const settings: Record<string, string> = {
  JWT_SECRET: SECRET,
  JWT_EXPIRES_IN: "1h",
  JWT_PERSISTENT_EXPIRES_IN: "7d",
  NODE_ENV: "test",
};
const config = {
  get: (key: string, fallback?: unknown) => settings[key] ?? fallback,
  getOrThrow: (key: string) => {
    if (settings[key] === undefined) throw new Error(`config eksik: ${key}`);
    return settings[key];
  },
};

const nowSec = () => Math.floor(Date.now() / 1000);

let app: INestApplication;
let base: string;
let rig: ReturnType<typeof makeAuthService>;
let jwt: JwtService;
let sessions: SessionRevocationService;
const realtime = new RealtimeService();
const disconnectSpy = jest.spyOn(realtime, "disconnectSession");
const adminSupabase = {
  verifyPassword: jest.fn(async () => ({ authId: "auth-admin-1", email: "admin@test.local" })),
  updatePassword: jest.fn(async () => undefined),
};

beforeAll(async () => {
  rig = makeAuthService();
  jwt = rig.jwt;
  const adminService = new AdminAuthService(
    prisma as never,
    jwt,
    adminSupabase as never,
    { log: jest.fn(async () => undefined) } as never,
    config as never,
  );

  @Module({
    imports: [PassportModule],
    controllers: [CompanyAuthController, AdminAuthController],
    providers: [
      { provide: ConfigService, useValue: config },
      { provide: JwtService, useValue: jwt },
      { provide: PrismaBypassService, useValue: prisma },
      { provide: CompanyAuthService, useValue: rig.service },
      { provide: AdminAuthService, useValue: adminService },
      {
        provide: PasswordResetService,
        useValue: {
          requestForCompany: async () => ({ ok: true }),
          requestForCompanyInBackground: () => ({ success: true }),
        },
      },
      { provide: RealtimeService, useValue: realtime },
      SessionRevocationService,
      CompanyJwtStrategy,
      AdminJwtStrategy,
      { provide: APP_INTERCEPTOR, useClass: AuthCookieInterceptor },
    ],
  })
  class SessionTestModule {}

  app = await NestFactory.create(SessionTestModule, { logger: false });
  await app.listen(0, "127.0.0.1");
  const { port } = app.getHttpServer().address() as AddressInfo;
  base = `http://127.0.0.1:${port}`;
  sessions = app.get(SessionRevocationService);
});

afterAll(async () => {
  await app?.close();
  await truncateAll();
  await prisma.$disconnect();
});

beforeEach(async () => {
  await truncateAll();
  disconnectSpy.mockClear();
});

// ── HTTP yardımcıları ────────────────────────────────────────────────

interface Reply {
  status: number;
  body: unknown;
  /** Yanıtın yazdığı çerezler (ad → değer; silme = boş dizgi). */
  cookies: Record<string, string>;
}

async function call(
  method: "GET" | "POST",
  path: string,
  opts: { cookie?: string; bearer?: string; json?: unknown } = {},
): Promise<Reply> {
  const headers: Record<string, string> = {};
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.bearer) headers.authorization = `Bearer ${opts.bearer}`;
  if (opts.json !== undefined) headers["content-type"] = "application/json";
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: opts.json !== undefined ? JSON.stringify(opts.json) : undefined,
  });
  const cookies: Record<string, string> = {};
  for (const line of res.headers.getSetCookie()) {
    const first = line.split(";")[0];
    const idx = first.indexOf("=");
    cookies[first.slice(0, idx)] = first.slice(idx + 1);
  }
  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    /* düz metin */
  }
  return { status: res.status, body, cookies };
}

const claimsOf = (token: string) =>
  jwt.verify<Record<string, unknown> & { jti?: string; exp: number; iat: number }>(token);

// ── Firma kurulumu ───────────────────────────────────────────────────

const PASSWORD = "Guclu!Parola9";

async function companyUser() {
  const email = `u-${Date.now()}-${Math.random().toString(36).slice(2)}@test.local`;
  await rig.service.signup({
    firstName: "Ada",
    lastName: "Yılmaz",
    email,
    phone: "+90 555 111 22 33",
    password: PASSWORD,
    termsAccepted: true,
    mediationAccepted: true,
    kvkkAccepted: true,
    marketingConsent: false,
  } as never);
  await rig.service.verifyEmail(email, extractCode(rig.email));
  const user = await prisma.companyUser.findUniqueOrThrow({ where: { email } });
  return { email, user };
}

/** Gerçek giriş ucu → httpOnly çerezdeki jeton. */
async function companyLogin(email: string): Promise<string> {
  const res = await call("POST", "/company-auth/login", {
    json: { email, password: PASSWORD },
  });
  expect(res.status).toBe(200);
  // Jeton gövdede DÖNMEZ (yalnız çerez).
  expect(res.body).not.toHaveProperty("token");
  const token = res.cookies.rk_company;
  expect(token).toBeTruthy();
  return token;
}

const companyMe = (token: string) =>
  call("GET", "/company-auth/me", { cookie: `rk_company=${token}` });

/** Elle imzalanmış firma jetonu (eski/yaşlı jeton senaryoları). */
function signCompany(
  user: { id: string; email: string; companyId: string },
  extra: Record<string, unknown> = {},
  expiresIn = "1h",
): string {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      type: "company",
      userId: user.id,
      companyId: user.companyId,
      tv: 0,
      ...extra,
    },
    { expiresIn },
  );
}

// ══════════════════════════════════════════════════════════════════════

describe("firma realm'i — çıkış yalnız o oturumu iptal eder", () => {
  it("çıkış → aynı çerez /me'de 401; aynı kullanıcının öteki oturumu 200 kalır", async () => {
    const { email } = await companyUser();
    const laptop = await companyLogin(email);
    const phone = await companyLogin(email);
    expect(claimsOf(laptop).jti).toBeTruthy();
    expect(claimsOf(phone).jti).toBeTruthy();
    expect(claimsOf(laptop).jti).not.toBe(claimsOf(phone).jti);

    expect((await companyMe(laptop)).status).toBe(200);
    expect((await companyMe(phone)).status).toBe(200);

    const out = await call("POST", "/company-auth/logout", {
      cookie: `rk_company=${laptop}`,
    });
    expect(out.status).toBe(200);
    expect(out.body).toEqual({ ok: true });
    // Çerez silinir ve aynı yanıtta YENİDEN yazılmaz.
    expect(out.cookies.rk_company).toBe("");

    // Çerezin kopyası (çalınmış / başka sekme) artık geçmez…
    expect((await companyMe(laptop)).status).toBe(401);
    // …Bearer geri düşüşüyle de geçmez.
    expect(
      (await call("GET", "/company-auth/me", { bearer: laptop })).status,
    ).toBe(401);
    // Öteki cihaz AÇIK kalır (sahip kararı).
    expect((await companyMe(phone)).status).toBe(200);

    const rows = await prisma.revokedSession.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ jti: claimsOf(laptop).jti, realm: "company" });
    // Satır, o oturumun alabileceği EN GEÇ jetondan (şimdi + 7 gün kalıcı
    // ömür) önce silinmez — yalnız sunulan jetonun exp'ine bağlanmaz.
    expect(rows[0].expiresAt.getTime()).toBeGreaterThanOrEqual(Date.now() + 7 * DAY_MS - 60_000);
    // Çıkış, o oturumun açık /rt soketlerini de kapatır.
    expect(disconnectSpy).toHaveBeenCalledWith(claimsOf(laptop).jti);
  });

  it("iptal TÜM örneklerde anında geçerli: taze önbellekli ikinci örnek de reddeder, 'iptal edilmedi' önbelleğe alınmaz", async () => {
    const { email } = await companyUser();
    const token = await companyLogin(email);
    const jti = claimsOf(token).jti!;
    // İkinci API örneği: kendi (boş) önbelleği, aynı veritabanı.
    const other = new SessionRevocationService(prisma as never, config as never);
    expect(await other.isRevoked(jti)).toBe(false); // çıkıştan ÖNCE soruldu

    await call("POST", "/company-auth/logout", { cookie: `rk_company=${token}` });

    // Olumsuz yanıt saklansaydı ikinci örnek hâlâ "geçerli" derdi.
    expect(await other.isRevoked(jti)).toBe(true);
    const otherStrategy = new CompanyJwtStrategy(config as never, prisma as never, other);
    await expect(otherStrategy.validate(claimsOf(token) as never)).rejects.toMatchObject({
      status: 401,
    });
  });

  it("jti'siz eski jeton (dağıtımdan önce verilmiş) kabul edilir; çıkışı satır yazmaz ve jeton ömrü dolana dek geçer", async () => {
    const { user } = await companyUser();
    const legacy = signCompany(user);
    expect(claimsOf(legacy).jti).toBeUndefined();
    expect((await companyMe(legacy)).status).toBe(200);

    const out = await call("POST", "/company-auth/logout", {
      cookie: `rk_company=${legacy}`,
    });
    expect(out.status).toBe(200);
    expect(out.cookies.rk_company).toBe("");
    expect(await prisma.revokedSession.count()).toBe(0);
    // Bilinen sınır: kimliği olmayan oturum iptal edilemez.
    expect((await companyMe(legacy)).status).toBe(200);
  });

  it("çıkış ucu geçersiz jetonla satır YAZDIRMAZ (sahte imza, başka realm, süresi dolmuş, çerezsiz)", async () => {
    const { user } = await companyUser();
    const forged = new JwtService({ secret: "baska-sir" }).sign(
      { type: "company", userId: user.id, jti: "sahte-oturum" },
      { expiresIn: "1h" },
    );
    const adminTyped = jwt.sign({ type: "admin", sub: "a1", jti: "admin-oturumu" });
    // iat 2 saat önce + 1 saat ömür → süresi 1 saat önce dolmuş.
    const expired = jwt.sign(
      { type: "company", userId: user.id, jti: "eski-oturum", iat: nowSec() - 7200 },
      { expiresIn: "1h" },
    );
    for (const cookie of [
      `rk_company=${forged}`,
      `rk_company=${adminTyped}`,
      `rk_company=${expired}`,
      "rk_company=bozuk.jeton",
      undefined,
    ]) {
      const out = await call("POST", "/company-auth/logout", { cookie });
      expect(out.status).toBe(200);
    }
    expect(await prisma.revokedSession.count()).toBe(0);
  });

  it("Bearer ile gelen oturum da çıkışta iptal edilir; aynı oturumdan ikinci çıkış sorunsuz", async () => {
    const { email } = await companyUser();
    const token = await companyLogin(email);
    expect((await call("POST", "/company-auth/logout", { bearer: token })).status).toBe(200);
    expect((await companyMe(token)).status).toBe(401);
    // Çift tık / iki sekme: ikinci çıkış 200, satır tek, süre kısalmaz.
    const before = await prisma.revokedSession.findFirstOrThrow();
    expect(
      (await call("POST", "/company-auth/logout", { cookie: `rk_company=${token}` })).status,
    ).toBe(200);
    const after = await prisma.revokedSession.findMany();
    expect(after).toHaveLength(1);
    expect(after[0].expiresAt.getTime()).toBe(before.expiresAt.getTime());
  });

  it("veritabanı yazılamazsa çıkış yine çerezi siler (200) — hata yutulmaz, loglanır", async () => {
    const { email } = await companyUser();
    const token = await companyLogin(email);
    const spy = jest
      .spyOn(sessions, "revokeToken")
      .mockRejectedValueOnce(new Error("db down"));
    const out = await call("POST", "/company-auth/logout", {
      cookie: `rk_company=${token}`,
    });
    spy.mockRestore();
    expect(out.status).toBe(200);
    expect(out.cookies.rk_company).toBe("");
  });

  it("parola değişimi eskisi gibi TÜM cihazları düşürür (tokenVersion); dönen jeton yeni oturum kimliği taşır", async () => {
    const { email, user } = await companyUser();
    const laptop = await companyLogin(email);
    const phone = await companyLogin(email);
    const res = await rig.service.changePassword(user.id, PASSWORD, "Yeni!Parola9");
    const fresh = claimsOf(res.token);
    expect(fresh.jti).toBeTruthy();
    expect(fresh.jti).not.toBe(claimsOf(laptop).jti);
    expect((await companyMe(laptop)).status).toBe(401);
    expect((await companyMe(phone)).status).toBe(401);
    expect((await companyMe(res.token)).status).toBe(200);
  });

  it("jeton veren HER yol oturum kimliği koyar: e-posta doğrulama, giriş, davet kabulü (createSession), parola değişimi", async () => {
    const email = `u-${Date.now()}-${Math.random().toString(36).slice(2)}@test.local`;
    await rig.service.signup({
      firstName: "Ada",
      lastName: "Yılmaz",
      email,
      phone: "+90 555 111 22 33",
      password: PASSWORD,
      termsAccepted: true,
      mediationAccepted: true,
      kvkkAccepted: true,
      marketingConsent: false,
    } as never);
    const verified = await rig.service.verifyEmail(email, extractCode(rig.email));
    const user = await prisma.companyUser.findUniqueOrThrow({ where: { email } });
    const login = await rig.service.login({ email, password: PASSWORD } as never);
    const invited = await rig.service.createSession(user.id);
    const changed = await rig.service.changePassword(user.id, PASSWORD, "Yeni!Parola9");
    const ids = [verified, login, invited, changed].map(
      (r) => claimsOf((r as { token: string }).token).jti,
    );
    for (const id of ids) expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(new Set(ids).size).toBe(4);
  });
});

describe("kayan yenileme (AuthCookieInterceptor) — iptal edilmiş oturum dirilmez", () => {
  /** Ömrünün yarısını geçmiş (yenileme eşiğinde) oturum çerezi jetonu. */
  const aged = (
    user: { id: string; email: string; companyId: string },
    extra: Record<string, unknown>,
  ) => signCompany(user, { persistent: false, iat: nowSec() - 3000, ...extra });

  // Kapısız uç: strateji devrede DEĞİL, interceptor yine çalışır.
  const publicCall = (token: string) =>
    call("POST", "/company-auth/forgot-password", {
      cookie: `rk_company=${token}`,
      json: { email: "x@test.local" },
    });

  it("yenileme oturum kimliğini KORUR → yenilenmiş çerez de aynı çıkışla düşer", async () => {
    const { user } = await companyUser();
    const old = aged(user, { jti: "oturum-1" });
    const res = await publicCall(old);
    const slid = res.cookies.rk_company;
    expect(slid).toBeTruthy();
    expect(slid).not.toBe(old);
    expect(claimsOf(slid).jti).toBe("oturum-1");
    expect(claimsOf(slid).exp).toBeGreaterThan(claimsOf(old).exp);

    // ESKİ kopyayla çıkış → yenilenmiş kopya da geçmez (oturum = jti zinciri).
    await call("POST", "/company-auth/logout", { cookie: `rk_company=${old}` });
    expect((await companyMe(slid)).status).toBe(401);
  });

  it("iptal edilmiş oturuma kapısız uçta taze jeton BASILMAZ", async () => {
    const { user } = await companyUser();
    const stolen = aged(user, { jti: "oturum-2" });
    await call("POST", "/company-auth/logout", { cookie: `rk_company=${stolen}` });

    const res = await publicCall(stolen);
    expect(res.status).toBe(200);
    // Basılsaydı zincir iptal satırının ömrünü aşar, temizlikten sonra dirilirdi.
    expect(res.cookies.rk_company).toBeUndefined();
    expect(res.cookies.rk_csrf).toBeUndefined();
  });

  it("jti'siz eski jeton ilk yenilemede oturum kimliği kazanır → artık iptal edilebilir", async () => {
    const { user } = await companyUser();
    const legacy = aged(user, {});
    const slid = (await publicCall(legacy)).cookies.rk_company;
    expect(slid).toBeTruthy();
    const jti = claimsOf(slid).jti;
    expect(jti).toMatch(/^[0-9a-f-]{36}$/);
    expect((await companyMe(slid)).status).toBe(200);

    await call("POST", "/company-auth/logout", { cookie: `rk_company=${slid}` });
    expect((await companyMe(slid)).status).toBe(401);
  });

  it("iptal sorgusu düşerse yenileme atlanır, yanıt bozulmaz", async () => {
    const { user } = await companyUser();
    const token = aged(user, { jti: "oturum-3" });
    const spy = jest.spyOn(sessions, "isRevoked").mockRejectedValueOnce(new Error("db down"));
    const res = await publicCall(token);
    spy.mockRestore();
    expect(res.status).toBe(200);
    expect(res.cookies.rk_company).toBeUndefined();
  });
});

describe("/rt geçidi — iptal edilmiş oturum bağlanamaz", () => {
  const open: Array<{ data: Record<string, unknown> }> = [];
  afterEach(() => {
    for (const s of open) {
      const t = s.data.expiryTimer as ReturnType<typeof setTimeout> | undefined;
      if (t) clearTimeout(t);
    }
    open.length = 0;
  });

  function socket(token: string) {
    const s = {
      // Tarayıcının gönderdiği biçim: httpOnly çerez handshake başlığında.
      handshake: { headers: { cookie: `rk_company=${token}` }, auth: {} },
      data: {} as Record<string, unknown>,
      rooms: new Set<string>(),
      join: jest.fn(),
      disconnect: jest.fn(),
    };
    open.push(s);
    return s;
  }
  const gateway = () =>
    new RealtimeGateway(
      { attach: jest.fn() } as never,
      new JwtService({}),
      config as never,
      prisma as never,
    );

  it("çıkış yapılan oturumun çereziyle handshake reddedilir; öteki oturum ve jti'siz eski jeton bağlanır", async () => {
    const { email, user } = await companyUser();
    const laptop = await companyLogin(email);
    const phone = await companyLogin(email);
    const legacy = signCompany(user);

    // Çıkıştan önce bağlanır ve oturum kimliği sokete yazılır.
    const before = socket(laptop);
    expect(await gateway().handleConnection(before as unknown as Socket)).toBe(true);
    expect(before.data.sessionId).toBe(claimsOf(laptop).jti);

    await call("POST", "/company-auth/logout", { cookie: `rk_company=${laptop}` });

    const revoked = socket(laptop);
    expect(await gateway().handleConnection(revoked as unknown as Socket)).toBe(false);
    expect(revoked.disconnect).toHaveBeenCalledWith(true);
    expect(revoked.join).not.toHaveBeenCalled();
    expect(revoked.data.companyId).toBeUndefined();

    const other = socket(phone);
    expect(await gateway().handleConnection(other as unknown as Socket)).toBe(true);
    expect(other.join).toHaveBeenCalledWith(`company:${user.companyId}`);

    const old = socket(legacy);
    expect(await gateway().handleConnection(old as unknown as Socket)).toBe(true);
    expect(old.data.sessionId).toBeUndefined();
  });

  it("disconnectSession yalnız o oturumun açık soketlerini kapatır; sunucu bağlı değilken no-op", () => {
    const svc = new RealtimeService();
    expect(svc.disconnectSession("s1")).toBe(0);
    const mk = (sessionId?: string) => ({ data: { sessionId }, disconnect: jest.fn() });
    const a = mk("s1");
    const a2 = mk("s1");
    const b = mk("s2");
    const legacy = mk(undefined);
    svc.attach({
      sockets: { sockets: new Map(Object.entries({ a, a2, b, legacy })) },
    } as never);
    expect(svc.disconnectSession("s1")).toBe(2);
    expect(a.disconnect).toHaveBeenCalledWith(true);
    expect(a2.disconnect).toHaveBeenCalledWith(true);
    expect(b.disconnect).not.toHaveBeenCalled();
    expect(legacy.disconnect).not.toHaveBeenCalled();
    // Boş kimlik hiçbir soketi (jti'siz eskiler dahil) kapatmaz.
    expect(svc.disconnectSession("")).toBe(0);
  });
});

describe("temizlik — süresi geçen iptal kayıtları silinir", () => {
  it("purgeExpired yalnız expiresAt'i geçmiş satırları siler; canlı iptal durur", async () => {
    const { email } = await companyUser();
    const token = await companyLogin(email);
    await call("POST", "/company-auth/logout", { cookie: `rk_company=${token}` });
    await prisma.revokedSession.createMany({
      data: [
        { jti: "eski-1", realm: "company", expiresAt: new Date(Date.now() - 1000) },
        { jti: "eski-2", realm: "admin", expiresAt: new Date(Date.now() - 30 * DAY_MS) },
      ],
    });

    const registry = { register: jest.fn(), recordRun: jest.fn() };
    const scheduler = new SessionRevocationScheduler(sessions, registry as never);
    scheduler.onModuleInit();
    expect(registry.register).toHaveBeenCalledWith(
      "sessions.purgeRevoked",
      expect.any(String),
      expect.any(String),
    );
    await scheduler.purge();
    expect(registry.recordRun).toHaveBeenCalledWith("sessions.purgeRevoked");

    const left = await prisma.revokedSession.findMany();
    expect(left.map((r) => r.jti)).toEqual([claimsOf(token).jti]);
    expect((await companyMe(token)).status).toBe(401);

    // Satır doğal ömrünü doldurunca o da gider (8 gün sonrası).
    expect(await sessions.purgeExpired(new Date(Date.now() + 8 * DAY_MS))).toBe(1);
    expect(await prisma.revokedSession.count()).toBe(0);
  });

  it("satır ömrü sunulan jetonun exp'inden kısa olamaz (yapılandırmadan uzun ömürlü jeton)", async () => {
    const exp = nowSec() + 40 * 24 * 3600;
    await sessions.revoke("uzun-oturum", "company", exp);
    const row = await prisma.revokedSession.findUniqueOrThrow({ where: { jti: "uzun-oturum" } });
    expect(row.expiresAt.getTime()).toBeGreaterThanOrEqual(exp * 1000);
  });
});

describe("admin realm'i — aynı sözleşme", () => {
  async function adminLogin(): Promise<string> {
    const res = await call("POST", "/admin/auth/login", {
      json: { email: "admin@test.local", password: "x" },
    });
    expect(res.status).toBe(200);
    expect(res.body).not.toHaveProperty("token");
    const token = res.cookies.rk_admin;
    expect(token).toBeTruthy();
    return token;
  }
  const adminMe = (token: string) =>
    call("GET", "/admin/auth/me", { cookie: `rk_admin=${token}` });

  beforeEach(async () => {
    await prisma.platformAdmin.create({
      data: {
        email: "admin@test.local",
        authId: "auth-admin-1",
        firstName: "Ad",
        lastName: "Min",
        role: "SUPER_ADMIN",
        isActive: true,
      },
    });
  });

  it("çıkış → aynı çerez /me'de 401; öteki admin oturumu 200; jti'siz eski jeton geçer", async () => {
    const desk = await adminLogin();
    const home = await adminLogin();
    expect(claimsOf(desk).jti).toBeTruthy();
    expect(claimsOf(desk).jti).not.toBe(claimsOf(home).jti);
    expect((await adminMe(desk)).status).toBe(200);

    const out = await call("POST", "/admin/auth/logout", { cookie: `rk_admin=${desk}` });
    expect(out.status).toBe(200);
    expect(out.cookies.rk_admin).toBe("");

    expect((await adminMe(desk)).status).toBe(401);
    expect((await adminMe(home)).status).toBe(200);
    expect(await prisma.revokedSession.findMany()).toEqual([
      expect.objectContaining({ jti: claimsOf(desk).jti, realm: "admin" }),
    ]);

    const admin = await prisma.platformAdmin.findFirstOrThrow();
    const legacy = jwt.sign({
      sub: admin.id,
      email: admin.email,
      role: admin.role,
      type: "admin",
      tv: 0,
    });
    expect((await adminMe(legacy)).status).toBe(200);
    await call("POST", "/admin/auth/logout", { cookie: `rk_admin=${legacy}` });
    expect((await adminMe(legacy)).status).toBe(200);
  });

  it("realm'ler karışmaz: firma çıkış ucu admin jetonunu iptal etmez", async () => {
    const token = await adminLogin();
    await call("POST", "/company-auth/logout", { bearer: token });
    expect(await prisma.revokedSession.count()).toBe(0);
    expect((await adminMe(token)).status).toBe(200);
  });

  it("admin parola değişimi: tüm eski oturumlar düşer, dönen jeton yeni oturum kimliğiyle geçer", async () => {
    const desk = await adminLogin();
    const admin = await prisma.platformAdmin.findFirstOrThrow();
    const res = await app
      .get(AdminAuthService)
      .changePassword(admin.id, "old-pass-123456", "new-pass-123456");
    expect(claimsOf(res.token).jti).toBeTruthy();
    expect(claimsOf(res.token).jti).not.toBe(claimsOf(desk).jti);
    expect((await adminMe(desk)).status).toBe(401);
    expect((await adminMe(res.token)).status).toBe(200);
  });
});
