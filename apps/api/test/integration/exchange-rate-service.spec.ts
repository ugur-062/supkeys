/**
 * KUR SERVİSİ — GERÇEK GÖVDE (canlı öncesi sağlamlaştırma, 2026-10-07).
 *
 * Teklif/kazandırma testlerinin hepsi `exchangeRates`i `jest.fn` ile taklit
 * ediyordu; `ExchangeRateService`in kendisi hiç koşmuyordu. Burada test
 * şemasındaki `exchange_rates` satırlarıyla gerçek servis sınanır:
 *  - INV-FX-1: `getFreshRate` 7 günden bayat ya da kayıtsız birimde null →
 *    para yolu teklifi açık hatayla reddeder (uydurma/bayat kur damgası yok);
 *  - `getRateOnDate` / `getRatesOnDates` geri düşüşü;
 *  - `refreshFromTcmb`: TCMB HTTP taklidi → tarih ayrıştırma, upsert,
 *    idempotentlik, geçersiz/ileri tarih ve sıfır kur reddi, `onRatesChanged`;
 *  - `ExchangeRateScheduler.fetchDailyRates` cron kaydı.
 */
import "reflect-metadata";
import { of, throwError } from "rxjs";
import { CronRegistryService } from "../../src/common/cron/cron-registry.service";
import { FALLBACK_RATES, fxRate, resetFxRates } from "../../src/common/currency/fx-rates";
import type { PrismaBypassService, PrismaService } from "../../src/common/prisma/prisma.service";
import { ExchangeRateScheduler } from "../../src/modules/currency/schedulers/exchange-rate.scheduler";
import { ExchangeRateService } from "../../src/modules/currency/services/exchange-rate.service";
import { EUR_PEGGED, TcmbService } from "../../src/modules/currency/services/tcmb.service";
import { makeCompanyWithUser, makeItem, makeListing } from "./factories";
import { makeService } from "./make-service";
import { prisma, truncateAll } from "./test-db";

const DAY = 86_400_000;

/** n gün önceki UTC gece yarısı — TCMB satır anahtarıyla aynı biçim. */
function utcDay(daysAgo = 0): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - daysAgo * DAY);
}
const iso = (d: Date) => d.toISOString().slice(0, 10);
/** 2026-10-07 → 07.10.2026 (TCMB `Tarih`). */
const trDate = (d: Date) => iso(d).split("-").reverse().join(".");
/** 2026-10-07 → 10/07/2026 (TCMB `Date`). */
const usDate = (d: Date) => {
  const [y, m, dd] = iso(d).split("-");
  return `${m}/${dd}/${y}`;
};

async function rate(currency: string, value: number, daysAgo: number, source = "TCMB") {
  return prisma.exchangeRate.create({
    data: { currency: currency as never, rate: value, rateDate: utcDay(daysAgo), source },
  });
}

const cur = (code: string, selling: string, unit = "1") =>
  `<Currency CurrencyCode="${code}"><Unit>${unit}</Unit><ForexSelling>${selling}</ForexSelling></Currency>`;
const xml = (attrs: string, currencies: string) =>
  `<?xml version="1.0" encoding="UTF-8"?><Tarih_Date ${attrs}>${currencies}</Tarih_Date>`;

/** Gerçek TcmbService + taklit HTTP (son yanıt değiştirilebilir). */
function rig(initial?: string) {
  const http = { get: jest.fn(() => of({ data: initial ?? "" })) };
  const tcmb = new TcmbService(http as never);
  const service = new ExchangeRateService(
    prisma as unknown as PrismaService,
    tcmb,
    prisma as unknown as PrismaBypassService,
  );
  return {
    service,
    http,
    respond: (body: string) => http.get.mockImplementation(() => of({ data: body })),
  };
}

beforeEach(async () => {
  await truncateAll();
  resetFxRates();
});
afterEach(() => jest.restoreAllMocks());
afterAll(async () => {
  resetFxRates();
  await truncateAll();
  await prisma.$disconnect();
});

describe("getFreshRate — para yolu kuru (INV-FX-1)", () => {
  it("6 günlük kur sayı döner; 8 günlük ve kayıtsız birim null", async () => {
    const { service } = rig();
    await rate("USD", 41.25, 6);
    await rate("EUR", 48.5, 8);

    expect(await service.getFreshRate("USD")).toBe(41.25);
    expect(await service.getFreshRate("EUR")).toBeNull();
    expect(await service.getFreshRate("GBP")).toBeNull();
    expect(await service.getFreshRate("TRY")).toBe(1);
  });

  it("eşik tam 7 gün: 7 gün dahil taze, 1 ms sonrası bayat", async () => {
    const { service } = rig();
    const row = await rate("USD", 40, 3);
    const at = row.rateDate.getTime();

    jest.spyOn(Date, "now").mockReturnValue(at + 7 * DAY);
    expect(await service.getFreshRate("USD")).toBe(40);

    jest.spyOn(Date, "now").mockReturnValue(at + 7 * DAY + 1);
    expect(await service.getFreshRate("USD")).toBeNull();
  });

  it("en güncel satırı okur; başka birimin taze kuru bayat birimi kurtarmaz", async () => {
    const { service } = rig();
    await rate("USD", 39, 5);
    await rate("USD", 41, 1);
    await rate("USD", 40, 3);
    await rate("EUR", 47, 20);

    expect(await service.getFreshRate("USD")).toBe(41);
    expect(await service.getFreshRate("EUR")).toBeNull();
  });

  it("gösterim kuru (getCurrentRate) bayat/yedek değeri döner; para yolu aynı durumda null", async () => {
    const { service } = rig();
    await rate("EUR", 48.5, 30);

    expect(await service.getCurrentRate("EUR")).toBe(48.5);
    expect(await service.getFreshRate("EUR")).toBeNull();
    // Tablo boş birim: gösterim YEDEK kur, para yolu null.
    expect(await service.getCurrentRate("USD")).toBe(FALLBACK_RATES.USD);
    expect(await service.getFreshRate("USD")).toBeNull();

    expect(await service.freshness()).toEqual({ latestRateDate: iso(utcDay(30)), stale: true });
  });

  it("freshness / latestRateDate: boş tablo bayat sayılır; taze satırda stale=false", async () => {
    const { service } = rig();
    expect(await service.freshness()).toEqual({ latestRateDate: null, stale: true });
    expect(await service.latestRateDate()).toBeNull();

    await rate("USD", 41, 2);
    expect(await service.freshness()).toEqual({ latestRateDate: iso(utcDay(2)), stale: false });
    expect(await service.latestRateDate()).toBe(iso(utcDay(2)));
  });
});

describe("getRateOnDate / getRatesOnDates — tarihli kur", () => {
  it("o günün kuru; yayın olmayan günde önceki son kur; ilk kayıttan önce YEDEK", async () => {
    const { service } = rig();
    await rate("USD", 39, 10);
    await rate("USD", 40, 7);
    await rate("USD", 41, 3);

    const at = (daysAgo: number, hour = 12) => new Date(utcDay(daysAgo).getTime() + hour * 3_600_000);

    expect(await service.getRateOnDate("USD", at(7))).toBe(40);
    // 6 ve 4 gün önce yayın yok (hafta sonu) → 7 gün önceki kur.
    expect(await service.getRateOnDate("USD", at(6))).toBe(40);
    expect(await service.getRateOnDate("USD", at(4))).toBe(40);
    expect(await service.getRateOnDate("USD", at(3, 0))).toBe(41);
    expect(await service.getRateOnDate("USD", new Date())).toBe(41);
    // Gelecekteki satır geçmiş güne sızmaz.
    expect(await service.getRateOnDate("USD", at(9))).toBe(39);
    // İlk kayıttan önce / hiç kaydı olmayan birim → YEDEK kur.
    expect(await service.getRateOnDate("USD", at(11))).toBe(FALLBACK_RATES.USD);
    expect(await service.getRateOnDate("EUR", new Date())).toBe(FALLBACK_RATES.EUR);
    expect(await service.getRateOnDate("TRY", new Date())).toBe(1);
  });

  it("toplu okuma tek tek okumayla birebir aynı sonucu verir (sıra korunur)", async () => {
    const { service } = rig();
    await rate("EUR", 47, 10);
    await rate("EUR", 48, 7);
    await rate("EUR", 49, 3);
    const at = (daysAgo: number) => new Date(utcDay(daysAgo).getTime() + 9 * 3_600_000);
    const dates = [at(2), at(12), at(7), at(5), at(10), at(0)];

    const bulk = await service.getRatesOnDates("EUR", dates);
    const single = await Promise.all(dates.map((d) => service.getRateOnDate("EUR", d)));
    expect(bulk).toEqual(single);
    expect(bulk).toEqual([49, FALLBACK_RATES.EUR, 48, 48, 47, 49]);

    expect(await service.getRatesOnDates("TRY", dates)).toEqual(dates.map(() => 1));
    expect(await service.getRatesOnDates("EUR", [])).toEqual([]);
  });

  it("toTry: tarih verilirse o günün, verilmezse en güncel kurla çevirir", async () => {
    const { service } = rig();
    await rate("USD", 40, 7);
    await rate("USD", 41, 1);
    expect(await service.toTry(10, "USD")).toBe(410);
    expect(await service.toTry(10, "USD", new Date(utcDay(5).getTime()))).toBe(400);
    expect(await service.toTry(10, "TRY")).toBe(10);
  });
});

describe("refreshFromTcmb — TCMB çekimi (HTTP taklidi)", () => {
  const body = (d: Date, extra = "") =>
    xml(
      `Tarih="${trDate(d)}" Date="${usDate(d)}"`,
      cur("USD", "41.2345") + cur("EUR", "48.5000") + cur("JPY", "27.5000", "100") + extra,
    );

  it("TR tarihini ayrıştırır, UTC gün anahtarıyla yazar; 100'lük birim ve avroya bağlı birim doğru", async () => {
    const d = utcDay(1);
    const { service, http } = rig(body(d));

    const res = await service.refreshFromTcmb();
    expect(res.success).toBe(true);
    expect(res.date).toBe(iso(d));
    expect(res.rates).toMatchObject({ USD: 41.2345, EUR: 48.5 });
    expect(http.get).toHaveBeenCalledWith(
      "https://www.tcmb.gov.tr/kurlar/today.xml",
      expect.objectContaining({ responseType: "text" }),
    );

    const rows = await prisma.exchangeRate.findMany({ orderBy: { currency: "asc" } });
    expect(rows.map((r) => r.currency).sort()).toEqual(["BGN", "EUR", "JPY", "USD"]);
    for (const r of rows) {
      expect(r.rateDate.toISOString()).toBe(d.toISOString());
      expect(r.source).toBe("TCMB");
    }
    const by = (c: string) => Number(rows.find((r) => r.currency === c)!.rate);
    expect(by("USD")).toBe(41.2345);
    expect(by("JPY")).toBeCloseTo(0.275, 6);
    expect(by("BGN")).toBeCloseTo(48.5 / EUR_PEGGED.BGN!, 5);

    // Yazılan kur para yolunda hemen taze okunur.
    expect(await service.getFreshRate("USD")).toBe(41.2345);
  });

  it("yalnız `Date` (AA/GG/YYYY) niteliği varsa ay-gün karışmaz", async () => {
    // Ay ≠ gün olan sabit bir tarih: ayrıştırma ters olsaydı farklı güne yazardı.
    jest.spyOn(Date, "now").mockReturnValue(Date.UTC(2026, 9, 7, 13, 0, 0));
    const { service } = rig(xml(`Date="10/05/2026"`, cur("USD", "41.0000")));

    const res = await service.refreshFromTcmb();
    expect(res).toMatchObject({ success: true, date: "2026-10-05" });
    const row = await prisma.exchangeRate.findFirstOrThrow({ where: { currency: "USD" } });
    expect(row.rateDate.toISOString()).toBe("2026-10-05T00:00:00.000Z");
  });

  it("aynı gün ikinci çekim idempotent: satır çoğalmaz, kur güncellenir", async () => {
    const d = utcDay(0);
    const { service, respond } = rig(body(d));
    await service.refreshFromTcmb();
    const before = await prisma.exchangeRate.count();

    respond(xml(`Tarih="${trDate(d)}"`, cur("USD", "42.0000") + cur("EUR", "48.5000") + cur("JPY", "27.5000", "100")));
    const res = await service.refreshFromTcmb();
    expect(res.success).toBe(true);
    expect(await prisma.exchangeRate.count()).toBe(before);
    expect(await service.getFreshRate("USD")).toBe(42);
  });

  it("yeni günün çekimi eski satırı silmez; en güncel gün geçerli olur", async () => {
    const { service, respond } = rig(body(utcDay(1)));
    await service.refreshFromTcmb();
    respond(xml(`Tarih="${trDate(utcDay(0))}"`, cur("USD", "43.0000")));
    await service.refreshFromTcmb();

    expect(await prisma.exchangeRate.count({ where: { currency: "USD" } })).toBe(2);
    expect(await service.getFreshRate("USD")).toBe(43);
    expect(await service.getRateOnDate("USD", new Date(utcDay(1).getTime() + 3_600_000))).toBe(41.2345);
  });

  it("aynı günün MANUAL satırının üzerine TCMB yazar (kaynak TCMB'ye döner)", async () => {
    const d = utcDay(0);
    await rate("USD", 99, 0, "MANUAL");
    const { service } = rig(body(d));

    await service.refreshFromTcmb();
    const rows = await prisma.exchangeRate.findMany({ where: { currency: "USD" } });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.source).toBe("TCMB");
    expect(Number(rows[0]!.rate)).toBe(41.2345);
  });

  it("TCMB eski günü yayınlıyorsa (hafta sonu) bugünün MANUAL kuru geçerli kalır", async () => {
    await rate("USD", 44, 0, "MANUAL");
    const { service } = rig(body(utcDay(2)));

    expect((await service.refreshFromTcmb()).success).toBe(true);
    expect(await service.getFreshRate("USD")).toBe(44);
    expect(await prisma.exchangeRate.count({ where: { currency: "USD" } })).toBe(2);
  });

  it("TCMB'ye ulaşılamazsa başarısız döner, tabloya dokunmaz; eski kur bayatlayınca para yolu kapanır", async () => {
    await rate("USD", 40, 8);
    const { service, http } = rig();
    http.get.mockImplementation(() => throwError(() => new Error("ECONNRESET")) as never);
    const changed = jest.spyOn(service, "onRatesChanged");

    expect(await service.refreshFromTcmb()).toEqual({
      success: false,
      reason: "TCMB unreachable or invalid response",
    });
    expect(changed).not.toHaveBeenCalled();
    expect(await prisma.exchangeRate.count()).toBe(1);
    expect(await service.getFreshRate("USD")).toBeNull();
  });

  it.each([
    ["beklenmeyen gövde", "<html><body>Bakım</body></html>"],
    ["tarihsiz XML", xml("", cur("USD", "41.0000"))],
    ["bozuk XML", "<Tarih_Date"],
  ])("%s → başarısız, satır yazılmaz", async (_label, payload) => {
    const { service } = rig(payload);
    expect((await service.refreshFromTcmb()).success).toBe(false);
    expect(await prisma.exchangeRate.count()).toBe(0);
  });

  it.each([
    ["takvimde olmayan gün", `Tarih="31.02.2026"`],
    ["ay 13", `Tarih="05.13.2026"`],
    ["sayı olmayan tarih", `Tarih="aa.bb.cccc"`],
    ["eksik parça", `Date="10/2026/"`],
  ])("geçersiz tarih (%s) reddedilir, satır yazılmaz", async (_label, attrs) => {
    const { service } = rig(xml(attrs, cur("USD", "41.0000")));
    const changed = jest.spyOn(service, "onRatesChanged");

    const res = await service.refreshFromTcmb();
    expect(res.success).toBe(false);
    expect(await prisma.exchangeRate.count()).toBe(0);
    expect(changed).not.toHaveBeenCalled();
  });

  it("ileri tarihli yanıt reddedilir (hiç bayatlamayan 'en güncel' satır oluşmaz)", async () => {
    await rate("USD", 40, 1);
    const future = new Date(utcDay(0).getTime() + 30 * DAY);
    const { service } = rig(xml(`Tarih="${trDate(future)}"`, cur("USD", "1.0000")));

    expect(await service.refreshFromTcmb()).toEqual({ success: false, reason: "TCMB date is in the future" });
    expect(await prisma.exchangeRate.count()).toBe(1);
    expect(await service.getFreshRate("USD")).toBe(40);
  });

  it("sıfır/negatif/boş kur yazılmaz; diğer birimler yazılır", async () => {
    await rate("USD", 40, 1);
    const d = utcDay(0);
    const { service } = rig(
      xml(`Tarih="${trDate(d)}"`, cur("USD", "0") + cur("GBP", "-3.5") + cur("CHF", "") + cur("EUR", "48.5000")),
    );

    const res = await service.refreshFromTcmb();
    expect(res.success).toBe(true);
    expect(res.rates).not.toHaveProperty("USD");
    expect(res.rates).not.toHaveProperty("GBP");
    expect(res.rates).toMatchObject({ EUR: 48.5 });
    // USD'nin en güncel satırı hâlâ dünkü gerçek kur — sıfır satırı onu ezmedi.
    expect(await service.getFreshRate("USD")).toBe(40);
    expect(await prisma.exchangeRate.count({ where: { currency: { in: ["GBP", "CHF"] as never } } })).toBe(0);
  });

  it("takip edilen birim yoksa başarısız", async () => {
    const { service } = rig(xml(`Tarih="${trDate(utcDay(0))}"`, cur("XDR", "60.0000")));
    expect(await service.refreshFromTcmb()).toEqual({
      success: false,
      reason: "No tracked currencies in TCMB response",
    });
  });

  it("başarıda onRatesChanged çalışır: bellek kur tablosu ve ürün fiyat tabanı yeni kurla tazelenir", async () => {
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
        priceAmountBase: 1,
      },
    });
    const { service } = rig(body(utcDay(0)));
    const changed = jest.spyOn(service, "onRatesChanged");
    expect(fxRate("USD")).toBe(FALLBACK_RATES.USD);

    await service.refreshFromTcmb();

    expect(changed).toHaveBeenCalledTimes(1);
    expect(fxRate("USD")).toBe(41.2345);
    const after = await prisma.companyItem.findUniqueOrThrow({ where: { id: product.id } });
    expect(Number(after.priceAmountBase)).toBe(412.35);
  });

  it("onRatesChanged hatası kur işini düşürmez (kurlar yazılmış kalır)", async () => {
    const { service } = rig(body(utcDay(0)));
    jest.spyOn(service, "refreshProductPriceBases").mockRejectedValue(new Error("boom"));

    expect((await service.refreshFromTcmb()).success).toBe(true);
    expect(await service.getFreshRate("USD")).toBe(41.2345);
  });

  it("açılışta bellek kur tablosu DB'deki en güncel kurlarla dolar", async () => {
    await rate("USD", 40, 5);
    await rate("USD", 41.5, 1);
    await rate("EUR", 48, 2);
    const { service } = rig();

    await service.onApplicationBootstrap();
    expect(fxRate("USD")).toBe(41.5);
    expect(fxRate("EUR")).toBe(48);
    // Tabloda olmayan birim yedek kurda kalır.
    expect(fxRate("GBP")).toBe(FALLBACK_RATES.GBP);
  });
});

describe("ExchangeRateScheduler — günlük cron", () => {
  it("başarılı çekim kurları yazar ve cron kaydını 'ok' işaretler", async () => {
    const { service } = rig(
      xml(`Tarih="${trDate(utcDay(0))}"`, cur("USD", "41.0000") + cur("EUR", "48.0000")),
    );
    const registry = new CronRegistryService();
    const scheduler = new ExchangeRateScheduler(service, registry);
    scheduler.onModuleInit();

    await scheduler.fetchDailyRates();

    const rec = registry.snapshot().find((r) => r.key === "currency.fetchDailyRates")!;
    expect(rec.lastStatus).toBe("ok");
    expect(await service.getFreshRate("USD")).toBe(41);
  });

  it("TCMB arızasında fırlatmaz, cron kaydı 'error'; mevcut kur yerinde kalır", async () => {
    await rate("USD", 40, 2);
    const { service, http } = rig();
    http.get.mockImplementation(() => throwError(() => new Error("timeout")) as never);
    const registry = new CronRegistryService();
    const scheduler = new ExchangeRateScheduler(service, registry);
    scheduler.onModuleInit();

    await expect(scheduler.fetchDailyRates()).resolves.toBeUndefined();

    const rec = registry.snapshot().find((r) => r.key === "currency.fetchDailyRates")!;
    expect(rec.lastStatus).toBe("error");
    expect(await service.getFreshRate("USD")).toBe(40);
  });
});

describe("para yolu — gerçek kur servisiyle teklif (INV-FX-1)", () => {
  const FUTURE = new Date(Date.now() + 7 * DAY);
  const bidBase = { validityDays: 30, deliveryTime: "W1_2" };

  /** Teklif servisi; kur bacağı GERÇEK ExchangeRateService'e bağlı. */
  async function setup() {
    const { service, exchangeRates } = makeService();
    const real = rig().service;
    exchangeRates.getFreshRate.mockImplementation((c: string) => real.getFreshRate(c as never));
    exchangeRates.getCurrentRate.mockImplementation((c: string) => real.getCurrentRate(c as never));

    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const bidder = await makeCompanyWithUser(prisma, { country: "TR" });
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      status: "OPEN",
      visibility: "PUBLIC",
      closesAt: FUTURE,
      primaryCurrency: "TRY",
      allowedCurrencies: ["TRY", "EUR"],
    } as never);
    const item1 = await makeItem(prisma, listing.id, { name: "Yerli kalem", quantity: 2 } as never);
    const item2 = await makeItem(prisma, listing.id, { name: "İthal kalem", quantity: 3 } as never);
    const place = () =>
      service.placeBid(bidder.auth, listing.id, {
        ...bidBase,
        items: [
          { itemId: item1.id, unitPrice: 100 },
          { itemId: item2.id, unitPrice: 10, currency: "EUR" },
        ],
      } as never);
    const bids = () => prisma.listingBid.count({ where: { listingId: listing.id } });
    return { place, bids, bidder, listing, item2 };
  }

  it("8 günlük (bayat) kurla TRY dışı kalemli teklif açık hatayla reddedilir, kayıt oluşmaz", async () => {
    const { place, bids } = await setup();
    await rate("EUR", 48, 8);

    await expect(place()).rejects.toThrow(/Güncel kur bilgisi yok/);
    expect(await bids()).toBe(0);
  });

  it("kur tablosu boşken de reddedilir (YEDEK kur para yoluna girmez)", async () => {
    const { place, bids } = await setup();

    await expect(place()).rejects.toThrow(/Güncel kur bilgisi yok/);
    expect(await bids()).toBe(0);
  });

  it("6 günlük kurla kabul edilir; kalem damgası tablodaki kurdur", async () => {
    const { place, bidder, listing, item2 } = await setup();
    await rate("EUR", 48, 6);

    await place();

    const bid = await prisma.listingBid.findFirstOrThrow({
      where: { listingId: listing.id, bidderCompanyId: bidder.company.id },
      include: { items: true },
    });
    expect(bid.status).toBe("SUBMITTED");
    // 100×2 TRY + 10×3 EUR × 48 = 1640 TRY
    expect(bid.amount.toString()).toBe("1640");
    expect(Number(bid.items.find((i) => i.itemId === item2.id)!.fxToBase)).toBe(48);
  });

  it("bayat kur kilidi elle girilen bugünkü kurla açılır", async () => {
    const { place, bids } = await setup();
    await rate("EUR", 48, 9);
    await expect(place()).rejects.toThrow(/Güncel kur bilgisi yok/);

    await rate("EUR", 49, 0, "MANUAL");
    await place();
    expect(await bids()).toBe(1);
  });
});
