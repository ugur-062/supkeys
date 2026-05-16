/**
 * V2-3 — TCMB exchange rate servisi.
 *
 * Test edilen:
 *   - getCurrentRate: TRY=1, DB latest, fallback boş DB için
 *   - getRateOnDate: <= date, fallback
 *   - getCurrentRates: 8 currency map (TRY=1)
 *   - takeSnapshot: TRY=null, DB → snapshot shape, FALLBACK source
 *   - toTry: amount * rate (current + onDate)
 *   - refreshFromTcmb: TCMB mock → upsert (TCMB başarısız ise reason döner)
 */
import { TestingModule } from "@nestjs/testing";
import { ExchangeRateService } from "./services/exchange-rate.service";
import { TcmbService } from "./services/tcmb.service";
import {
  getTestPrisma,
  resetDatabase,
  disconnectTestPrisma,
} from "../../../test/helpers/db";
import { buildTestModule } from "../../../test/helpers/test-module";

describe("ExchangeRateService", () => {
  let moduleRef: TestingModule;
  let service: ExchangeRateService;
  const tcmbMock = {
    fetchTodayRates: jest.fn(),
  };
  const prisma = getTestPrisma();

  beforeAll(async () => {
    moduleRef = await buildTestModule({
      providers: [
        ExchangeRateService,
        { provide: TcmbService, useValue: tcmbMock },
      ],
    });
    service = moduleRef.get(ExchangeRateService);
  });

  afterAll(async () => {
    await moduleRef.close();
    await disconnectTestPrisma();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    tcmbMock.fetchTodayRates.mockReset();
  });

  describe("getCurrentRate", () => {
    it("TRY → 1 (base currency)", async () => {
      expect(await service.getCurrentRate("TRY")).toBe(1);
    });

    it("DB boş → fallback rate (USD=34)", async () => {
      const rate = await service.getCurrentRate("USD");
      expect(rate).toBe(34);
    });

    it("DB'de değer var → en güncel rate", async () => {
      await prisma.exchangeRate.create({
        data: {
          currency: "USD",
          rate: 45.5,
          rateDate: new Date("2026-05-01"),
          source: "TCMB",
        },
      });
      await prisma.exchangeRate.create({
        data: {
          currency: "USD",
          rate: 46.2,
          rateDate: new Date("2026-05-10"),
          source: "TCMB",
        },
      });

      const rate = await service.getCurrentRate("USD");
      expect(rate).toBe(46.2); // en güncel
    });
  });

  describe("getRateOnDate — bid snapshot için", () => {
    it("TRY → 1 (her tarih için)", async () => {
      expect(await service.getRateOnDate("TRY", new Date())).toBe(1);
    });

    it("verilen tarihten önceki en güncel rate", async () => {
      await prisma.exchangeRate.create({
        data: {
          currency: "EUR",
          rate: 35,
          rateDate: new Date("2026-04-01"),
          source: "TCMB",
        },
      });
      await prisma.exchangeRate.create({
        data: {
          currency: "EUR",
          rate: 40,
          rateDate: new Date("2026-05-10"),
          source: "TCMB",
        },
      });

      // 2026-04-15 tarihinde → 2026-04-01 kuru kullanılmalı (≤ date)
      const rate = await service.getRateOnDate("EUR", new Date("2026-04-15"));
      expect(rate).toBe(35);

      // 2026-05-15 → 2026-05-10 kuru
      const rate2 = await service.getRateOnDate("EUR", new Date("2026-05-15"));
      expect(rate2).toBe(40);
    });

    it("tüm rate'ler tarihten sonra ise → fallback (EUR=37)", async () => {
      await prisma.exchangeRate.create({
        data: {
          currency: "EUR",
          rate: 50,
          rateDate: new Date("2026-12-31"),
          source: "TCMB",
        },
      });
      const rate = await service.getRateOnDate("EUR", new Date("2026-01-01"));
      expect(rate).toBe(37);
    });
  });

  describe("getCurrentRates — 8'li map", () => {
    it("DB boş → TRY=1 + 7 currency fallback'ler", async () => {
      const rates = await service.getCurrentRates();
      expect(rates.TRY).toBe(1);
      expect(rates.USD).toBe(34);
      expect(rates.EUR).toBe(37);
      expect(rates.GBP).toBe(43);
      expect(rates.JPY).toBe(0.23);
    });

    it("birkaç currency DB'de var → karma fallback + DB", async () => {
      await prisma.exchangeRate.create({
        data: {
          currency: "USD",
          rate: 45,
          rateDate: new Date("2026-05-10"),
          source: "TCMB",
        },
      });
      const rates = await service.getCurrentRates();
      expect(rates.USD).toBe(45);
      expect(rates.EUR).toBe(37); // fallback
    });
  });

  describe("takeSnapshot — bid submit anı", () => {
    it("TRY → null (caller direkt kullanmaz)", async () => {
      const snap = await service.takeSnapshot("TRY");
      expect(snap).toBeNull();
    });

    it("DB'de değer var → TCMB source snapshot", async () => {
      const rateDate = new Date("2026-05-10");
      await prisma.exchangeRate.create({
        data: {
          currency: "USD",
          rate: 45.27,
          rateDate,
          source: "TCMB",
        },
      });

      const snap = await service.takeSnapshot("USD");
      expect(snap).toMatchObject({
        rate: 45.27,
        source: "TCMB",
        rateDate: "2026-05-10",
      });
      expect(snap?.fetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it("DB boş → FALLBACK source snapshot", async () => {
      const snap = await service.takeSnapshot("EUR");
      expect(snap?.source).toBe("FALLBACK");
      expect(snap?.rate).toBe(37);
    });
  });

  describe("toTry — currency conversion", () => {
    it("TRY → kendisi", async () => {
      expect(await service.toTry(1000, "TRY")).toBe(1000);
    });

    it("USD * current rate (fallback 34) = 34000", async () => {
      expect(await service.toTry(1000, "USD")).toBe(34000);
    });

    it("DB'de rate varsa onu kullan", async () => {
      await prisma.exchangeRate.create({
        data: {
          currency: "USD",
          rate: 45,
          rateDate: new Date("2026-05-10"),
          source: "TCMB",
        },
      });
      expect(await service.toTry(100, "USD")).toBe(4500);
    });

    it("onDate parametresi → o tarih rate'i", async () => {
      await prisma.exchangeRate.create({
        data: {
          currency: "USD",
          rate: 30,
          rateDate: new Date("2026-01-01"),
          source: "TCMB",
        },
      });
      await prisma.exchangeRate.create({
        data: {
          currency: "USD",
          rate: 50,
          rateDate: new Date("2026-05-01"),
          source: "TCMB",
        },
      });

      // 2026-03-01'de USD kuru → 30 (≤ date filter)
      const result = await service.toTry(100, "USD", new Date("2026-03-01"));
      expect(result).toBe(3000);
    });
  });

  describe("refreshFromTcmb — TCMB cron job", () => {
    it("TCMB unreachable (null) → success:false", async () => {
      tcmbMock.fetchTodayRates.mockResolvedValueOnce(null);
      const result = await service.refreshFromTcmb();
      expect(result.success).toBe(false);
      expect(result.reason).toContain("TCMB");
    });

    it("TCMB invalid date → success:false", async () => {
      tcmbMock.fetchTodayRates.mockResolvedValueOnce({
        date: "not-a-date",
        rates: { USD: 45 },
      });
      const result = await service.refreshFromTcmb();
      expect(result.success).toBe(false);
      expect(result.reason).toContain("Invalid TCMB date");
    });

    it("happy: 8 currency upsert → DB'ye yazar", async () => {
      tcmbMock.fetchTodayRates.mockResolvedValueOnce({
        date: "2026-05-10",
        rates: { USD: 45.5, EUR: 50, GBP: 60, CHF: 52, JPY: 0.3, AED: 12, CNY: 6 },
      });

      const result = await service.refreshFromTcmb();
      expect(result.success).toBe(true);
      expect(result.date).toBe("2026-05-10");

      const usd = await prisma.exchangeRate.findFirst({
        where: { currency: "USD" },
      });
      expect(usd).toBeDefined();
      expect(Number(usd?.rate)).toBe(45.5);
      expect(usd?.source).toBe("TCMB");
    });

    it("idempotent: aynı tarih ile 2. çağrı → update", async () => {
      tcmbMock.fetchTodayRates.mockResolvedValueOnce({
        date: "2026-05-10",
        rates: { USD: 45 },
      });
      await service.refreshFromTcmb();

      tcmbMock.fetchTodayRates.mockResolvedValueOnce({
        date: "2026-05-10",
        rates: { USD: 46 }, // güncellenmiş kur
      });
      await service.refreshFromTcmb();

      const count = await prisma.exchangeRate.count({
        where: { currency: "USD" },
      });
      expect(count).toBe(1); // upsert — tek satır

      const usd = await prisma.exchangeRate.findFirst({
        where: { currency: "USD" },
      });
      expect(Number(usd?.rate)).toBe(46); // güncellenmiş
    });

    it("TCMB'den hiç tracked currency gelmedi → success:false", async () => {
      tcmbMock.fetchTodayRates.mockResolvedValueOnce({
        date: "2026-05-10",
        rates: { BTC: 1_000_000 } as any, // tracked olmayan
      });
      const result = await service.refreshFromTcmb();
      expect(result.success).toBe(false);
      expect(result.reason).toContain("No tracked");
    });

    it("kısmi response: NaN/Infinity değerleri atlanır", async () => {
      tcmbMock.fetchTodayRates.mockResolvedValueOnce({
        date: "2026-05-10",
        rates: { USD: 45, EUR: NaN, GBP: Infinity },
      });
      const result = await service.refreshFromTcmb();
      expect(result.success).toBe(true);
      // Sadece USD persiste edildi
      const eur = await prisma.exchangeRate.findFirst({
        where: { currency: "EUR" },
      });
      expect(eur).toBeNull();
    });
  });
});
