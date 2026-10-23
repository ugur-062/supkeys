/**
 * ADMİN KUR KAÇIŞ YOLU — POST /admin/system/refresh-rates ve
 * POST /admin/system/rates/manual (canlı öncesi sağlamlaştırma, 2026-10-07).
 *
 * Bayat kur kilidinin (INV-FX-1: `getFreshRate` null → TRY dışı teklif reddi)
 * TEK çıkışı bu iki uç; ikisi de hiç test edilmemişti. Burada gerçek HTTP
 * (Nest uygulaması + gerçek `AdminRolesGuard` + gerçek `ValidationPipe`),
 * gerçek `ExchangeRateService` ve test şemasındaki `exchange_rates` ile:
 *  - rol kapısı: elle kur YALNIZ SUPER_ADMIN; TCMB yenileme SUPER_ADMIN + SALES
 *    (`admin-permissions.ts` `refreshRates` ile aynı), SUPPORT ikisinde de 403;
 *  - 10 kat sapma koruması — tablo boşken YEDEK kura göre (atlanmaz);
 *  - elle kurdan sonra para yolu kuru (`getFreshRate`) taze sayıyı döner;
 *  - gün anahtarı UTC (TCMB satırıyla aynı) — sunucu saat diliminden bağımsız;
 *  - aynı gün TCMB yenilemesi elle kurun üzerine yazar.
 *
 * Kimlik doğrulama: `admin-jwt` passport stratejisi testte başlıktan rol okuyan
 * sahte stratejiyle değiştirilir (JWT/DB yolu `admin-roles.guard.spec` ve
 * `admin-session-revocation.spec`te sınanıyor); guard zincirinin kalanı gerçek.
 */
import "reflect-metadata";
import type { AddressInfo } from "node:net";
import { Module, ValidationPipe, type INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { of, throwError } from "rxjs";
import { CronRegistryService } from "../../src/common/cron/cron-registry.service";
import { FALLBACK_RATES, fxRate, resetFxRates } from "../../src/common/currency/fx-rates";
import { PrismaBypassService, type PrismaService } from "../../src/common/prisma/prisma.service";
import { AdminSystemController } from "../../src/modules/admin-system/admin-system.controller";
import { AuditService } from "../../src/modules/audit/audit.service";
import { ExchangeRateService } from "../../src/modules/currency/services/exchange-rate.service";
import { TcmbService } from "../../src/modules/currency/services/tcmb.service";
import { EmailSuppressionService } from "../../src/modules/email/email-suppression.service";
import { makeCompanyWithUser } from "./factories";
import { prisma, truncateAll } from "./test-db";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const passport = require("passport") as { use(name: string, strategy: unknown): void };

const DAY = 86_400_000;
type Role = "SUPER_ADMIN" | "SALES" | "SUPPORT";

function utcDay(daysAgo = 0): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - daysAgo * DAY);
}
const trDate = (d: Date) => d.toISOString().slice(0, 10).split("-").reverse().join(".");
const cur = (code: string, selling: string) =>
  `<Currency CurrencyCode="${code}"><Unit>1</Unit><ForexSelling>${selling}</ForexSelling></Currency>`;
const tcmbXml = (d: Date, currencies: string) =>
  `<?xml version="1.0" encoding="UTF-8"?><Tarih_Date Tarih="${trDate(d)}">${currencies}</Tarih_Date>`;

async function rate(currency: string, value: number, daysAgo: number, source = "TCMB") {
  return prisma.exchangeRate.create({
    data: { currency: currency as never, rate: value, rateDate: utcDay(daysAgo), source },
  });
}
const usdRows = () => prisma.exchangeRate.findMany({ where: { currency: "USD" }, orderBy: { rateDate: "asc" } });

let app: INestApplication;
let base: string;
let exchangeRates: ExchangeRateService;
const http = { get: jest.fn() };
const admins = {} as Record<Role, { id: string }>;

/** Başlıktan rol okuyan sahte `admin-jwt` stratejisi (gerçek guard'lar aynen çalışır). */
const fakeAdminStrategy = {
  name: "admin-jwt",
  authenticate(
    this: { success(user: unknown): void; fail(status: number): void },
    req: { headers: Record<string, string | undefined> },
  ) {
    const role = req.headers["x-test-role"] as Role | undefined;
    if (!role) return this.fail(401);
    this.success({
      id: req.headers["x-test-admin-id"] ?? admins[role]?.id ?? `admin-${role}`,
      email: `${role.toLowerCase()}@test.local`,
      firstName: "Test",
      lastName: "Admin",
      role,
      twoFactorEnabled: true,
      mustChangePassword: req.headers["x-test-must-change"] === "1",
    });
  },
};

async function post(
  path: string,
  role: Role | null,
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(role ? { "x-test-role": role } : {}),
      ...headers,
    },
    body: JSON.stringify(body ?? {}),
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json };
}
const manual = (role: Role | null, body: unknown, headers?: Record<string, string>) =>
  post("/admin/system/rates/manual", role, body, headers);
const refresh = (role: Role | null) => post("/admin/system/refresh-rates", role);

beforeAll(async () => {
  passport.use("admin-jwt", fakeAdminStrategy);
  exchangeRates = new ExchangeRateService(
    prisma as unknown as PrismaService,
    new TcmbService(http as never),
    prisma as unknown as PrismaBypassService,
  );

  @Module({
    controllers: [AdminSystemController],
    providers: [
      { provide: PrismaBypassService, useValue: prisma },
      { provide: ExchangeRateService, useValue: exchangeRates },
      { provide: CronRegistryService, useValue: new CronRegistryService() },
      { provide: AuditService, useValue: new AuditService(prisma as never) },
      { provide: EmailSuppressionService, useValue: {} },
      { provide: ConfigService, useValue: { get: () => undefined } },
    ],
  })
  class RatesTestModule {}

  app = await NestFactory.create(RatesTestModule, { logger: false });
  // main.ts ile aynı doğrulama ayarları (whitelist + forbidNonWhitelisted + transform).
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
  await app.listen(0, "127.0.0.1");
  base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
});

beforeEach(async () => {
  await truncateAll();
  resetFxRates();
  http.get.mockReset();
  http.get.mockImplementation(() => throwError(() => new Error("TCMB kapalı")));
  let n = 0;
  for (const role of ["SUPER_ADMIN", "SALES", "SUPPORT"] as const) {
    n += 1;
    admins[role] = await prisma.platformAdmin.create({
      data: {
        email: `${role.toLowerCase()}-${Date.now()}-${n}@rates.test`,
        authId: `auth-rates-${Date.now()}-${n}`,
        firstName: "Test",
        lastName: role,
        role,
      },
    });
  }
});

afterEach(() => jest.restoreAllMocks());

afterAll(async () => {
  await app?.close();
  resetFxRates();
  await truncateAll();
  await prisma.$disconnect();
});

describe("rol kapısı", () => {
  it("oturumsuz istek iki uçta da 401", async () => {
    expect((await manual(null, { currency: "USD", rate: 41 })).status).toBe(401);
    expect((await refresh(null)).status).toBe(401);
    expect(await prisma.exchangeRate.count()).toBe(0);
  });

  it("elle kur YALNIZ SUPER_ADMIN: SALES ve SUPPORT 403, hiçbir şey yazılmaz", async () => {
    await rate("USD", 40, 1);

    for (const role of ["SALES", "SUPPORT"] as const) {
      const res = await manual(role, { currency: "USD", rate: 41 });
      expect(res.status).toBe(403);
    }
    const rows = await usdRows();
    expect(rows).toHaveLength(1);
    expect(Number(rows[0]!.rate)).toBe(40);
    expect(await prisma.auditLog.count({ where: { action: "admin.system.manual_rate_set" } })).toBe(0);

    const ok = await manual("SUPER_ADMIN", { currency: "USD", rate: 41 });
    expect(ok.status).toBe(200);
    expect(ok.json).toEqual({ ok: true, currency: "USD", rate: 41 });
  });

  it("TCMB yenileme: SUPPORT 403 ve TCMB hiç çağrılmaz; SUPER_ADMIN ve SALES çalıştırır", async () => {
    const denied = await refresh("SUPPORT");
    expect(denied.status).toBe(403);
    expect(http.get).not.toHaveBeenCalled();
    expect(await prisma.auditLog.count()).toBe(0);

    http.get.mockImplementation(() => of({ data: tcmbXml(utcDay(0), cur("USD", "41.5000")) }));
    for (const role of ["SUPER_ADMIN", "SALES"] as const) {
      const res = await refresh(role);
      expect(res.status).toBe(200);
      expect(res.json).toMatchObject({ success: true, rates: { USD: 41.5 } });
    }
    expect(http.get).toHaveBeenCalledTimes(2);
    const audits = await prisma.auditLog.findMany({ where: { action: "admin.system.rates_refreshed" } });
    expect(audits.map((a) => a.actorId).sort()).toEqual([admins.SALES.id, admins.SUPER_ADMIN.id].sort());
  });

  it("geçici şifresini değiştirmemiş SUPER_ADMIN elle kur giremez (403)", async () => {
    const res = await manual("SUPER_ADMIN", { currency: "USD", rate: 41 }, { "x-test-must-change": "1" });
    expect(res.status).toBe(403);
    expect(await prisma.exchangeRate.count()).toBe(0);
  });
});

describe("elle kur — gövde doğrulaması", () => {
  it.each([
    ["TRY (sabit 1)", { currency: "TRY", rate: 1 }],
    ["bilinmeyen birim", { currency: "XXX", rate: 10 }],
    ["birim yok", { rate: 41 }],
    ["kur yok", { currency: "USD" }],
    ["sıfır", { currency: "USD", rate: 0 }],
    ["negatif", { currency: "USD", rate: -41 }],
    ["sayı değil", { currency: "USD", rate: "kırk bir" }],
    ["sonsuz", { currency: "USD", rate: "Infinity" }],
    ["fazladan alan (rateDate)", { currency: "USD", rate: 41, rateDate: "2020-01-01" }],
    ["fazladan alan (source)", { currency: "USD", rate: 41, source: "TCMB" }],
  ])("%s → 400, satır yazılmaz", async (_label, body) => {
    const res = await manual("SUPER_ADMIN", body);
    expect(res.status).toBe(400);
    expect(await prisma.exchangeRate.count()).toBe(0);
    expect(await prisma.auditLog.count()).toBe(0);
  });
});

describe("10 kat sapma koruması", () => {
  it("mevcut kurun 10 katından fazlası ve onda birinden azı reddedilir; sınır değerler kabul", async () => {
    await rate("USD", 40, 1);

    for (const bad of [400.01, 4000, 3.99, 0.4]) {
      const res = await manual("SUPER_ADMIN", { currency: "USD", rate: bad });
      expect(res.status).toBe(400);
    }
    expect(await usdRows()).toHaveLength(1);
    expect(await prisma.auditLog.count()).toBe(0);
    // Reddedilen girişten sonra para yolu kuru değişmedi.
    expect(await exchangeRates.getFreshRate("USD")).toBe(40);

    expect((await manual("SUPER_ADMIN", { currency: "USD", rate: 400 })).status).toBe(200);
    expect(await exchangeRates.getFreshRate("USD")).toBe(400);
  });

  it("alt sınır (tam onda bir) kabul edilir", async () => {
    await rate("USD", 40, 1);
    expect((await manual("SUPER_ADMIN", { currency: "USD", rate: 4 })).status).toBe(200);
    expect(await exchangeRates.getFreshRate("USD")).toBe(4);
  });

  it("kıyas EN GÜNCEL satıra göredir, bayat olsa da (bayatlık korumayı atlatmaz)", async () => {
    await rate("USD", 4, 60);
    await rate("USD", 40, 20);

    expect((await manual("SUPER_ADMIN", { currency: "USD", rate: 0.5 })).status).toBe(400);
    expect((await manual("SUPER_ADMIN", { currency: "USD", rate: 401 })).status).toBe(400);
    expect((await manual("SUPER_ADMIN", { currency: "USD", rate: 45 })).status).toBe(200);
  });

  it("TABLO BOŞKEN de çalışır: kıyas YEDEK kura göre yapılır, koruma atlanmaz", async () => {
    expect(await prisma.exchangeRate.count()).toBe(0);
    const usd = FALLBACK_RATES.USD; // 48.99

    // 100 kat (virgül kayması) ve yüzde bir → ret.
    expect((await manual("SUPER_ADMIN", { currency: "USD", rate: usd * 100 })).status).toBe(400);
    expect((await manual("SUPER_ADMIN", { currency: "USD", rate: usd / 100 })).status).toBe(400);
    expect((await manual("SUPER_ADMIN", { currency: "USD", rate: usd * 10 + 0.01 })).status).toBe(400);
    expect(await prisma.exchangeRate.count()).toBe(0);
    expect(await exchangeRates.getFreshRate("USD")).toBeNull();

    // Makul değer kabul edilir ve para yolu açılır.
    expect((await manual("SUPER_ADMIN", { currency: "USD", rate: 49.5 })).status).toBe(200);
    expect(await exchangeRates.getFreshRate("USD")).toBe(49.5);
  });

  it("tablo boşken küçük birimde de birim ölçeğiyle kıyaslar (KRW: 1 TL reddedilir, 0,04 kabul)", async () => {
    // KRW yedeği 0,0362 → üst sınır 0,362. "1" yazmak 27 kat sapma.
    expect((await manual("SUPER_ADMIN", { currency: "KRW", rate: 1 })).status).toBe(400);
    expect((await manual("SUPER_ADMIN", { currency: "KRW", rate: 0.04 })).status).toBe(200);
    expect(await exchangeRates.getFreshRate("KRW")).toBe(0.04);
  });

  it("mevcut kur okunamazsa istek hata verir, koruma sessizce atlanmaz", async () => {
    jest.spyOn(exchangeRates, "getCurrentRate").mockRejectedValue(new Error("db down"));

    const res = await manual("SUPER_ADMIN", { currency: "USD", rate: 999_999 });
    expect(res.status).toBe(500);
    expect(await prisma.exchangeRate.count()).toBe(0);
  });

  it("bir birimin reddi diğer birimi etkilemez; kıyas birim başına", async () => {
    await rate("USD", 40, 1);
    await rate("JPY", 0.3, 1);

    // 40, JPY için 133 kat; USD için makul.
    expect((await manual("SUPER_ADMIN", { currency: "JPY", rate: 40 })).status).toBe(400);
    expect((await manual("SUPER_ADMIN", { currency: "USD", rate: 41 })).status).toBe(200);
    expect(await exchangeRates.getFreshRate("JPY")).toBe(0.3);
  });
});

describe("elle kur → para yolu", () => {
  it("bayat kurda getFreshRate null; elle kurdan sonra taze sayı döner (MANUAL, bugünün UTC günü)", async () => {
    await rate("USD", 40, 8);
    expect(await exchangeRates.getFreshRate("USD")).toBeNull();

    const res = await manual("SUPER_ADMIN", { currency: "USD", rate: 41.25 });
    expect(res.status).toBe(200);

    expect(await exchangeRates.getFreshRate("USD")).toBe(41.25);
    const rows = await usdRows();
    expect(rows).toHaveLength(2);
    const today = rows[1]!;
    expect(today.source).toBe("MANUAL");
    expect(today.rateDate.toISOString()).toBe(utcDay(0).toISOString());
    // Eski satır geçmiş için yerinde (tarihli çevrim bozulmaz).
    expect(Number(rows[0]!.rate)).toBe(40);
    expect(await exchangeRates.getRateOnDate("USD", new Date(utcDay(3).getTime()))).toBe(40);
    // Elle kur yalnız girilen birimi açar.
    expect(await exchangeRates.getFreshRate("EUR")).toBeNull();
  });

  it("denetim kaydı: kim, hangi birim, hangi kur", async () => {
    await rate("USD", 40, 1);
    await manual("SUPER_ADMIN", { currency: "USD", rate: 41.25 });

    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: "admin.system.manual_rate_set" } });
    expect(log.actorType).toBe("admin");
    expect(log.actorId).toBe(admins.SUPER_ADMIN.id);
    expect(log.entityType).toBe("system");
    expect(log.entityId).toBe("rate:USD");
    expect(log.metadata).toEqual({ currency: "USD", rate: 41.25 });
  });

  it("onRatesChanged çalışır: bellek kur tablosu ve ürün fiyat tabanı yeni kurla tazelenir", async () => {
    await rate("USD", 40, 1);
    const { company, user } = await makeCompanyWithUser(prisma, {});
    const product = await prisma.companyItem.create({
      data: {
        companyId: company.id,
        createdById: user.id,
        name: "Dolar fiyatlı ürün",
        unit: "adet",
        priceMode: "FIXED",
        priceAmount: 10,
        priceCurrency: "USD",
        priceAmountBase: 400,
      },
    });
    const changed = jest.spyOn(exchangeRates, "onRatesChanged");

    await manual("SUPER_ADMIN", { currency: "USD", rate: 42 });

    expect(changed).toHaveBeenCalledTimes(1);
    expect(fxRate("USD")).toBe(42);
    const after = await prisma.companyItem.findUniqueOrThrow({ where: { id: product.id } });
    expect(Number(after.priceAmountBase)).toBe(420);
  });

  it("aynı gün ikinci elle giriş satırı günceller (tek satır, son değer)", async () => {
    await rate("USD", 40, 1);
    await manual("SUPER_ADMIN", { currency: "USD", rate: 41 });
    await manual("SUPER_ADMIN", { currency: "USD", rate: 42 });

    const rows = await usdRows();
    expect(rows).toHaveLength(2);
    expect(Number(rows[1]!.rate)).toBe(42);
    expect(await exchangeRates.getFreshRate("USD")).toBe(42);
  });

  it("bugünün TCMB satırı varken elle kur ONU günceller (düne yazıp etkisiz kalmaz)", async () => {
    await rate("USD", 40, 0, "TCMB");

    expect((await manual("SUPER_ADMIN", { currency: "USD", rate: 41 })).status).toBe(200);

    const rows = await usdRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.source).toBe("MANUAL");
    expect(Number(rows[0]!.rate)).toBe(41);
    expect(await exchangeRates.getFreshRate("USD")).toBe(41);
  });

  describe("sunucu saat dilimi", () => {
    const originalTz = process.env.TZ;
    afterEach(() => {
      if (originalTz === undefined) delete process.env.TZ;
      else process.env.TZ = originalTz;
    });

    it.each(["Europe/Istanbul", "America/Los_Angeles", "Pacific/Kiritimati", "UTC"])(
      "TZ=%s: gün anahtarı yine bugünün UTC günü; bugünün TCMB satırı varken elle kur geçerli olur",
      async (tz) => {
        process.env.TZ = tz;
        await rate("USD", 40, 0, "TCMB");

        expect((await manual("SUPER_ADMIN", { currency: "USD", rate: 41 })).status).toBe(200);

        const rows = await usdRows();
        expect(rows).toHaveLength(1);
        expect(rows[0]!.rateDate.toISOString()).toBe(utcDay(0).toISOString());
        expect(await exchangeRates.getFreshRate("USD")).toBe(41);
      },
    );
  });
});

describe("elle kur ↔ aynı gün TCMB yenilemesi", () => {
  it("TCMB bugünü yayınladıysa yenileme elle kurun üzerine yazar (kaynak TCMB)", async () => {
    await rate("USD", 40, 1);
    await manual("SUPER_ADMIN", { currency: "USD", rate: 45 });
    expect(await exchangeRates.getFreshRate("USD")).toBe(45);

    http.get.mockImplementation(() => of({ data: tcmbXml(utcDay(0), cur("USD", "41.5000")) }));
    const res = await refresh("SUPER_ADMIN");
    expect(res.json).toMatchObject({ success: true });

    const rows = await usdRows();
    expect(rows).toHaveLength(2);
    expect(rows[1]!.source).toBe("TCMB");
    expect(await exchangeRates.getFreshRate("USD")).toBe(41.5);
  });

  it("TCMB yalnız eski günü yayınlıyorsa (hafta sonu/tatil) elle kur geçerli kalır", async () => {
    await rate("USD", 40, 9);
    await manual("SUPER_ADMIN", { currency: "USD", rate: 45 });

    http.get.mockImplementation(() => of({ data: tcmbXml(utcDay(2), cur("USD", "41.5000")) }));
    expect((await refresh("SUPER_ADMIN")).json).toMatchObject({ success: true });

    expect(await exchangeRates.getFreshRate("USD")).toBe(45);
    const latest = (await usdRows()).at(-1)!;
    expect(latest.source).toBe("MANUAL");
  });

  it("TCMB yenilemesi yalnız yayınladığı birimleri ezer; elle girilen başka birim kalır", async () => {
    await manual("SUPER_ADMIN", { currency: "GBP", rate: 66 });

    http.get.mockImplementation(() => of({ data: tcmbXml(utcDay(0), cur("USD", "41.5000")) }));
    await refresh("SUPER_ADMIN");

    expect(await exchangeRates.getFreshRate("GBP")).toBe(66);
    expect(await exchangeRates.getFreshRate("USD")).toBe(41.5);
  });

  it("TCMB'ye ulaşılamazsa 200 + success:false; kurlar değişmez, deneme denetim kaydına düşer", async () => {
    await rate("USD", 40, 1);
    await manual("SUPER_ADMIN", { currency: "USD", rate: 45 });

    const res = await refresh("SUPER_ADMIN");
    expect(res.status).toBe(200);
    expect(res.json).toEqual({ success: false, reason: "TCMB unreachable or invalid response" });

    expect(await exchangeRates.getFreshRate("USD")).toBe(45);
    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: "admin.system.rates_refreshed" } });
    expect(log.metadata).toEqual({ success: false, date: null });
    expect(log.entityId).toBe("exchange-rates");
  });

  it("başarılı yenileme denetim kaydına tarihle yazılır", async () => {
    http.get.mockImplementation(() => of({ data: tcmbXml(utcDay(1), cur("USD", "41.5000")) }));
    await refresh("SALES");

    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: "admin.system.rates_refreshed" } });
    expect(log.actorId).toBe(admins.SALES.id);
    expect(log.metadata).toEqual({ success: true, date: utcDay(1).toISOString().slice(0, 10) });
  });
});
