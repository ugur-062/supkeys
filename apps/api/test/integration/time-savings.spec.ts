/**
 * Zaman Tasarrufu motoru — sözleşme testleri.
 *
 * 1) SAF çekirdek (computeSavings): bilinen sayaç + parametre → beklenen
 *    dakikalar (kırılım + net tasarruf; sistem süresi düşülür; negatif 0'a
 *    kırpılır; hatırlatma parametresi v1'de HESABA KATILMAZ).
 * 2) Servis: config override önceliği (firma > global > kod fallback) +
 *    boş firma davranışı (sayaçlar 0, tasarruf 0, TL null).
 */
import {
  DEFAULT_TIME_SAVINGS_PARAMS,
  TimeSavingsService,
  computeSavings,
  periodStart,
  type TimeSavingsCounters,
} from "../../src/modules/company-dashboard/time-savings.service";
import "reflect-metadata";
import type { PrismaService } from "../../src/common/prisma/prisma.service";
import { prisma, truncateAll } from "./test-db";
import { makeCompanyWithUser } from "./factories";

const P = DEFAULT_TIME_SAVINGS_PARAMS;

describe("computeSavings (saf çekirdek)", () => {
  const counters: TimeSavingsCounters = {
    listings: 2,
    invitations: 10,
    bids: 6,
    avgItemsPerBid: 3,
    revisionRounds: 4,
    approvals: 1,
    orders: 2,
  };

  it("bilinen sayaçlarla beklenen kırılımı üretir", () => {
    const r = computeSavings(P, counters);
    const by = Object.fromEntries(r.breakdown.map((b) => [b.key, b.minutes]));
    expect(by.rfq_mail).toBe(6 * 10); // 60
    // teklif başına: 4 × (1 + 0.15×(3-1)) = 5.2 → 6 teklif = 31.2
    expect(by.bid_excel).toBeCloseTo(31.2, 1);
    expect(by.comparison).toBe(15 * 2); // 30
    expect(by.revision).toBe(5 * 4); // 20
    expect(by.approval).toBe(20 * 1); // 20
    expect(by.po).toBe(10 * 2); // 20
    expect(r.estimated).toBeCloseTo(181.2, 1);
    // sistem: 10×2 + 1×6 + 3×1 + 2×2 = 33 → net ~148.2
    expect(r.system).toBe(33);
    expect(r.saved).toBeCloseTo(148.2, 1);
  });

  it("hatırlatma (followupMin) v1 hesabına girmez", () => {
    const a = computeSavings({ ...P, followupMin: 0 }, counters);
    const b = computeSavings({ ...P, followupMin: 500 }, counters);
    expect(a.saved).toBe(b.saved);
  });

  it("negatif tasarruf 0'a kırpılır (muhafazakâr)", () => {
    const r = computeSavings(
      { ...P, rfqMailPrepMin: 0, bidToExcelMin: 0, comparisonTableMin: 0, revisionRoundMin: 0, approvalLoopMin: 0, poPrepMin: 0 },
      counters,
    );
    expect(r.estimated).toBe(0);
    expect(r.saved).toBe(0);
  });

  it("periodStart: yıl/çeyrek/ay sınırları doğru", () => {
    const now = new Date(2026, 7, 3); // 3 Ağu 2026
    expect(periodStart("year", now).getMonth()).toBe(0);
    expect(periodStart("quarter", now).getMonth()).toBe(6); // Tem
    expect(periodStart("month", now).getMonth()).toBe(7);
  });
});

describe("TimeSavingsService (DB: config önceliği + boş firma)", () => {
  const service = new TimeSavingsService(prisma as unknown as PrismaService);

  beforeEach(async () => {
    await truncateAll();
  });
  it("config yoksa kod fallback; global satır varsa o; firma override kazanır", async () => {
    const fx = await makeCompanyWithUser(prisma, {});
    const cid = fx.company.id;

    const p1 = await service.loadParams(cid);
    expect(p1.rfqMailPrepMin).toBe(6); // kod fallback

    await prisma.timeSavingsConfig.create({
      data: { companyId: null, rfqMailPrepMin: 9 },
    });
    const p2 = await service.loadParams(cid);
    expect(p2.rfqMailPrepMin).toBe(9); // global satır

    await prisma.timeSavingsConfig.create({
      data: { companyId: cid, rfqMailPrepMin: 12, hourlyLaborCost: 500 },
    });
    const p3 = await service.loadParams(cid);
    expect(p3.rfqMailPrepMin).toBe(12); // firma override
    expect(p3.hourlyLaborCost).toBe(500);
  });

  it("boş firma: sayaçlar 0, tasarruf 0, TL null, sparkline 6 ay", async () => {
    const fx = await makeCompanyWithUser(prisma, {});
    const r = await service.forCompany(fx.company.id, "year");
    expect(r.savedMinutes).toBe(0);
    expect(r.counters.listings).toBe(0);
    expect(r.laborValueTry).toBeNull();
    expect(r.months).toHaveLength(6);
  });
});
