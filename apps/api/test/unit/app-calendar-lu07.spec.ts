/**
 * Derin denetim LU-07: pano dönem sınırları İstanbul duvar saatiyle; gelir
 * kurları birim başına toplu (`getRatesOnDates`, tarih başına sorgu yok).
 */
import {
  appDay,
  appDayStart,
  appMonth,
  appNextDayStart,
  appQuarterStart,
  appYearStart,
} from "../../src/common/time/app-calendar";
import { ExchangeRateService } from "../../src/modules/currency/services/exchange-rate.service";

describe("app-calendar (Europe/Istanbul)", () => {
  it("özel aralık günleri İstanbul 00:00'da başlar, `to` ertesi günün 00:00'ı (hariç)", () => {
    expect(appDayStart("2026-10-01")!.toISOString()).toBe("2026-09-30T21:00:00.000Z");
    expect(appNextDayStart("2026-10-31")!.toISOString()).toBe("2026-10-31T21:00:00.000Z");
    expect(appNextDayStart("2026-12-31")!.toISOString()).toBe("2026-12-31T21:00:00.000Z");
  });

  it("geçersiz gün null (sessiz taşma yok)", () => {
    expect(appDayStart("2026-02-30")).toBeNull();
    expect(appDayStart("2026-13-01")).toBeNull();
    expect(appDayStart("26-10-01")).toBeNull();
    expect(appNextDayStart("2026-02-30")).toBeNull();
  });

  it("UTC'de hâlâ Eylül ama İstanbul'da 1 Ekim → ay/çeyrek Ekim, yıl 2026", () => {
    const now = new Date("2026-09-30T22:00:00Z"); // 1 Eki 01:00 TR
    expect(appMonth(now).key).toBe("2026-10");
    expect(appMonth(now).start.toISOString()).toBe("2026-09-30T21:00:00.000Z");
    expect(appMonth(now).end.toISOString()).toBe("2026-10-31T21:00:00.000Z");
    expect(appQuarterStart(now).toISOString()).toBe("2026-09-30T21:00:00.000Z");
    expect(appYearStart(now).toISOString()).toBe("2025-12-31T21:00:00.000Z");
  });

  it("ay kaydırma yıl sınırını geçer; etiket anı aynı ayda kalır", () => {
    const now = new Date("2026-01-15T10:00:00Z");
    const m = appMonth(now, -1);
    expect(m.key).toBe("2025-12");
    expect(m.labelDate.getUTCMonth()).toBe(11);
    expect(appMonth(now, 12).key).toBe("2027-01");
  });

  it("appDay: 22:30Z İstanbul'da ertesi gün", () => {
    expect(appDay(new Date("2026-10-04T22:30:00Z")).day).toBe(5);
  });
});

describe("ExchangeRateService.getRatesOnDates", () => {
  const row = (d: string, rate: number) => ({ rateDate: new Date(`${d}T00:00:00Z`), rate });

  it("birim başına iki sorgu; her tarih için rateDate <= tarih olan son kur", async () => {
    const prisma = {
      exchangeRate: {
        findFirst: jest.fn().mockResolvedValue(row("2026-09-25", 40)),
        findMany: jest.fn().mockResolvedValue([row("2026-09-28", 41), row("2026-09-29", 42)]),
      },
    };
    const svc = new ExchangeRateService(prisma as never, {} as never, {} as never);
    const dates = [
      new Date("2026-09-27T12:00:00Z"), // hafta sonu → 25'i
      new Date("2026-09-29T08:00:00Z"),
      new Date("2026-09-28T00:00:00Z"),
      new Date("2026-09-27T12:00:00Z"),
    ];
    expect(await svc.getRatesOnDates("USD", dates)).toEqual([40, 42, 41, 40]);
    expect(prisma.exchangeRate.findFirst).toHaveBeenCalledTimes(1);
    expect(prisma.exchangeRate.findMany).toHaveBeenCalledTimes(1);
  });

  it("TRY ve boş liste sorgusuz", async () => {
    const prisma = { exchangeRate: { findFirst: jest.fn(), findMany: jest.fn() } };
    const svc = new ExchangeRateService(prisma as never, {} as never, {} as never);
    expect(await svc.getRatesOnDates("TRY", [new Date()])).toEqual([1]);
    expect(await svc.getRatesOnDates("USD", [])).toEqual([]);
    expect(prisma.exchangeRate.findFirst).not.toHaveBeenCalled();
  });
});
