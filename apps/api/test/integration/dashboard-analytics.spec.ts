/**
 * Pano analitiği — sözleşme testleri.
 * 1) Saf yardımcılar: monthWindows/deltaPct/previousWindow.
 * 2) Servis: boş firma şekli (tüm seriler 12 nokta, sayaçlar 0) + basit
 *    dolu senaryo (1 ihale + 1 teklif + kazandırma → funnel/winloss doğru).
 */
import "reflect-metadata";
import { Prisma } from "@prisma/client";
import {
  DashboardAnalyticsService,
  deltaPct,
  monthWindows,
  previousWindow,
} from "../../src/modules/company-dashboard/dashboard-analytics.service";
import type { PrismaService } from "../../src/common/prisma/prisma.service";
import { prisma, truncateAll } from "./test-db";
import { makeBid, makeCompanyWithUser, makeItem, makeListing } from "./factories";
import { resetFxRates, setFxRates } from "../../src/common/currency/fx-rates";

describe("analitik saf yardımcılar", () => {
  it("monthWindows 12 ardışık ay üretir", () => {
    const w = monthWindows(new Date(2026, 7, 3));
    expect(w).toHaveLength(12);
    expect(w[0]!.key).toBe("2025-09");
    expect(w[11]!.key).toBe("2026-08");
    expect(+w[1]!.start).toBe(+w[0]!.end);
  });

  it("deltaPct: önceki 0 → null; şimdiki 0 → null ('0 ↘ %100' yok); artış/azalış yüzdesi", () => {
    expect(deltaPct(5, 0)).toBeNull();
    expect(deltaPct(0, 5)).toBeNull();
    expect(deltaPct(6, 4)).toBe(50);
    expect(deltaPct(2, 4)).toBe(-50);
  });

  it("previousWindow dönem uzunluğunu korur", () => {
    const now = new Date(2026, 7, 3);
    const q = previousWindow("quarter", now);
    expect(q.start.getMonth()).toBe(3); // Nis (Tem çeyreği öncesi)
    expect(q.end.getMonth()).toBe(6);
  });
});

describe("DashboardAnalyticsService (DB)", () => {
  const service = new DashboardAnalyticsService(
    prisma as unknown as PrismaService,
  );

  beforeEach(async () => {
    await truncateAll();
  });

  it("boş firma: seriler 12 nokta, funnel/aksiyonlar 0, pareto boş", async () => {
    const fx = await makeCompanyWithUser(prisma, {});
    const sa = await service.satinalma(fx.company.id, "year");
    expect(sa.funnel.map((f) => f.count)).toEqual([0, 0, 0, 0, 0]);
    expect(sa.kpiSeries.listings).toHaveLength(12);
    expect(sa.actions.closingSoon).toBe(0);
    expect(sa.cashCalendar).toHaveLength(5);

    const st = await service.satis(fx.company.id, "year");
    expect(st.revenueTrend).toHaveLength(12);
    expect(st.pareto.rows).toEqual([]);
    expect(st.missed.count).toBe(0);
    expect(st.pipeline.find((p) => p.key === "invites")!.amountTry).toBeNull();
  });

  it("dolu senaryo: teklif alan ihale funnel'a ve satıcının winLoss'una düşer", async () => {
    const buyer = await makeCompanyWithUser(prisma, {});
    const seller = await makeCompanyWithUser(prisma, {});
    const listing = await makeListing(prisma, {
      companyId: buyer.company.id,
      createdById: buyer.user.id,
      status: "OPEN",
    });
    const item = await makeItem(prisma, listing.id);
    await makeBid(prisma, {
      listingId: listing.id,
      bidderCompanyId: seller.company.id,
      createdById: seller.user.id,
      status: "SUBMITTED",
      amount: 1000,
      submittedAt: new Date(),
      items: [{ itemId: item.id, unitPrice: 100 }],
    });

    const sa = await service.satinalma(buyer.company.id, "year");
    const byKey = Object.fromEntries(sa.funnel.map((f) => [f.key, f.count]));
    expect(byKey.listings).toBe(1);
    expect(byKey.bids).toBe(1);
    expect(byKey.awarded).toBe(0);
    expect(sa.actions.awaitingDecision).toBe(1);
    expect(sa.competition.lowCompetition).toHaveLength(1);

    const st = await service.satis(seller.company.id, "year");
    const totalPending = st.winLoss.reduce((s, w) => s + w.pending, 0);
    expect(totalPending).toBe(1);
    expect(
      st.pipeline.find((p) => p.key === "submitted")!.count,
    ).toBe(1);
  });

  it("kohort funnel (Faz 5): aşamalar monotonic azalır; CANCELLED evrene girmez", async () => {
    const buyer = await makeCompanyWithUser(prisma, {});
    const seller = await makeCompanyWithUser(prisma, {});
    // 1) Teklif almış + kazandırılmış + siparişe dönmüş ihale.
    const won = await makeListing(prisma, {
      companyId: buyer.company.id,
      createdById: buyer.user.id,
      status: "AWARDED",
    });
    await prisma.listing.update({
      where: { id: won.id },
      data: { awardedAt: new Date() },
    });
    const item = await makeItem(prisma, won.id);
    await makeBid(prisma, {
      listingId: won.id,
      bidderCompanyId: seller.company.id,
      createdById: seller.user.id,
      status: "WON",
      amount: 100,
      submittedAt: new Date(),
      items: [{ itemId: item.id, unitPrice: 10 }],
    });
    await prisma.companyOrder.create({
      data: {
        buyerCompanyId: buyer.company.id,
        sellerCompanyId: seller.company.id,
        listingId: won.id,
        amount: 100,
        currency: "TRY",
        status: "ACCEPTED",
      },
    });
    // 2) Teklifsiz açık ihale (yalnız ilk aşamada sayılır).
    await makeListing(prisma, {
      companyId: buyer.company.id,
      createdById: buyer.user.id,
      status: "OPEN",
    });
    // 3) İptal edilmiş ihale — hiç sayılmaz.
    await makeListing(prisma, {
      companyId: buyer.company.id,
      createdById: buyer.user.id,
      status: "CANCELLED",
    });

    const sa = await service.satinalma(buyer.company.id, "year");
    const counts = sa.funnel.map((f) => f.count);
    expect(counts).toEqual([2, 1, 1, 1, 0]); // CANCELLED yok; teslim yok
    // Monotonic azalan — kohortta %100 üstü dönüşüm yapısal olarak imkansız.
    for (let i = 1; i < counts.length; i++) {
      expect(counts[i]!).toBeLessThanOrEqual(counts[i - 1]!);
    }
  });

  it("money bloğu (Faz 4 + 2026-09-27): TÜM siparişler rapor birimine (TR → TRY) çevrilip toplanır", async () => {
    setFxRates({ USD: 40 });
    const buyer = await makeCompanyWithUser(prisma, {});
    const seller = await makeCompanyWithUser(prisma, {});
    // Dönem içi TRY sipariş (ödenmemiş) + USD sipariş — eskiden USD sipariş
    // panodan DIŞLANIYORDU; artık güncel kurla TRY karşılığı eklenir.
    await prisma.companyOrder.create({
      data: {
        buyerCompanyId: buyer.company.id,
        sellerCompanyId: seller.company.id,
        amount: 5000,
        currency: "TRY",
        status: "ACCEPTED",
      },
    });
    await prisma.companyOrder.create({
      data: {
        buyerCompanyId: buyer.company.id,
        sellerCompanyId: seller.company.id,
        amount: 900,
        currency: "USD",
        status: "ACCEPTED",
      },
    });

    const sa = await service.satinalma(buyer.company.id, "year");
    expect(sa.currency).toBe("TRY");
    expect(sa.money.periodSpend).toBe(5000 + 900 * 40);
    expect(sa.money.openCommitment).toBe(5000 + 900 * 40); // ödeme yok → tamamı taahhüt
    expect(sa.money.dueIn30d).toBe(0); // teslim yok → vade türetilemez
    expect(sa.money.realizedSavings).toBe(0);
    resetFxRates();
  });

  it("yabancı satıcı (DE): gelir EUR biriminde ve TRY DIŞI siparişler dahil (eskiden 0 görünüyordu)", async () => {
    setFxRates({ EUR: 50 });
    const buyer = await makeCompanyWithUser(prisma, {});
    const seller = await makeCompanyWithUser(prisma, { country: "DE" });
    await prisma.companyOrder.create({
      data: { buyerCompanyId: buyer.company.id, sellerCompanyId: seller.company.id, amount: 1200, currency: "EUR", status: "ACCEPTED" },
    });
    await prisma.companyOrder.create({
      data: { buyerCompanyId: buyer.company.id, sellerCompanyId: seller.company.id, amount: 5000, currency: "TRY", status: "ACCEPTED" },
    });
    const st = await service.satis(seller.company.id, "year");
    expect(st.currency).toBe("EUR");
    const revenue = st.revenueTrend.reduce((n, p) => n + p.value, 0);
    expect(revenue).toBeCloseTo(1200 + 5000 / 50);
    expect(st.pareto.totalTry).toBeCloseTo(1300);
    resetFxRates();
  });

  it("kalem-bazlı kazandırma: tasarruf/hacim kalem başına TEK kazanan fiyatla, çift sayım yok (derin denetim 2026-09-29)", async () => {
    // Talep: A ve B, hedef 100/100. X: A=90,B=100; Y: A=95,B=80.
    // Kazandırma A→X, B→Y (ikisi de AWARDED_PARTIAL).
    // Doğru: tasarruf 10+20=30, hacim 90+80=170. Eski: tasarruf 35, hacim 365.
    const buyer = await makeCompanyWithUser(prisma, {});
    const x = await makeCompanyWithUser(prisma, {});
    const y = await makeCompanyWithUser(prisma, {});
    const listing = await makeListing(prisma, {
      companyId: buyer.company.id,
      createdById: buyer.user.id,
      status: "AWARDED",
      primaryCurrency: "TRY",
      awardedAt: new Date(),
    });
    const a = await makeItem(prisma, listing.id, { lineNo: 1, targetPrice: new Prisma.Decimal(100) });
    const b = await makeItem(prisma, listing.id, { lineNo: 2, targetPrice: new Prisma.Decimal(100) });
    await makeBid(prisma, {
      listingId: listing.id, bidderCompanyId: x.company.id, createdById: x.user.id,
      amount: 190, currency: "TRY", status: "AWARDED_PARTIAL",
      items: [{ itemId: a.id, unitPrice: 90 }, { itemId: b.id, unitPrice: 100 }],
    });
    await makeBid(prisma, {
      listingId: listing.id, bidderCompanyId: y.company.id, createdById: y.user.id,
      amount: 175, currency: "TRY", status: "AWARDED_PARTIAL",
      items: [{ itemId: a.id, unitPrice: 95 }, { itemId: b.id, unitPrice: 80 }],
    });

    const sa = await service.satinalma(buyer.company.id, "year");
    expect(sa.money.realizedSavings).toBeCloseTo(30, 5);
    expect(sa.topSavings[0]!.amount).toBeCloseTo(30, 5);
    expect(sa.savingsTrend.reduce((n, p) => n + p.value, 0)).toBeCloseTo(30, 5);
  });

  it("awardedQuantity varsa analitik de onu çarpar (Tasarruf sekmesiyle aynı)", async () => {
    const buyer = await makeCompanyWithUser(prisma, {});
    const seller = await makeCompanyWithUser(prisma, {});
    const listing = await makeListing(prisma, {
      companyId: buyer.company.id,
      createdById: buyer.user.id,
      status: "AWARDED",
      primaryCurrency: "TRY",
      awardedAt: new Date(),
    });
    const it1 = await makeItem(prisma, listing.id, {
      quantity: new Prisma.Decimal(10),
      targetPrice: new Prisma.Decimal(100),
      awardedQuantity: new Prisma.Decimal(4),
    });
    await makeBid(prisma, {
      listingId: listing.id, bidderCompanyId: seller.company.id, createdById: seller.user.id,
      amount: 800, currency: "TRY", status: "WON",
      items: [{ itemId: it1.id, unitPrice: 80 }],
    });
    const sa = await service.satinalma(buyer.company.id, "year");
    expect(sa.money.realizedSavings).toBeCloseTo(80, 5); // 20 × 4 (eski: 20 × 10)
  });

  it("satış pipeline 'kazanıldı' tutarı kısmi kazanılan teklifte teklifin tamamını değil kazanılan payı (sipariş) sayar", async () => {
    const buyer = await makeCompanyWithUser(prisma, {});
    const seller = await makeCompanyWithUser(prisma, {});
    const listing = await makeListing(prisma, {
      companyId: buyer.company.id,
      createdById: buyer.user.id,
      status: "AWARDED",
      awardedAt: new Date(),
    });
    await makeBid(prisma, {
      listingId: listing.id, bidderCompanyId: seller.company.id, createdById: seller.user.id,
      amount: 1000, currency: "TRY", status: "AWARDED_PARTIAL",
    });
    await prisma.companyOrder.create({
      data: {
        listingId: listing.id,
        buyerCompanyId: buyer.company.id,
        sellerCompanyId: seller.company.id,
        amount: 300,
        currency: "TRY",
        status: "PENDING",
      },
    });
    const st = await service.satis(seller.company.id, "year");
    const won = st.pipeline.find((p) => p.key === "won")!;
    expect(won.count).toBe(1);
    expect(won.amountTry).toBeCloseTo(300, 5); // eski: 1000
  });

  it("custom aralık (Faz 3): funnel yalnız [from,to) içindeki kayıtları sayar", async () => {
    const DAY = 86_400_000;
    const buyer = await makeCompanyWithUser(prisma, {});
    const inside = await makeListing(prisma, {
      companyId: buyer.company.id,
      createdById: buyer.user.id,
      status: "OPEN",
    });
    // Aralık içine taşı: 10 gün önce açılmış gibi.
    await prisma.listing.update({
      where: { id: inside.id },
      data: { createdAt: new Date(Date.now() - 10 * DAY) },
    });
    // İkincisi bugün (aralık DIŞI kalmalı).
    await makeListing(prisma, {
      companyId: buyer.company.id,
      createdById: buyer.user.id,
      status: "OPEN",
    });

    const ranged = await service.satinalma(buyer.company.id, "year", {
      from: new Date(Date.now() - 15 * DAY),
      to: new Date(Date.now() - 5 * DAY),
    });
    expect(ranged.funnel.find((f) => f.key === "listings")!.count).toBe(1);

    // Aralıksız (year) iki ihaleyi de görür.
    const full = await service.satinalma(buyer.company.id, "year");
    expect(full.funnel.find((f) => f.key === "listings")!.count).toBe(2);
  });
});
