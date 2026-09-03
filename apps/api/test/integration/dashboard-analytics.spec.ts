/**
 * Pano analitiği — sözleşme testleri.
 * 1) Saf yardımcılar: monthWindows/deltaPct/previousWindow.
 * 2) Servis: boş firma şekli (tüm seriler 12 nokta, sayaçlar 0) + basit
 *    dolu senaryo (1 ihale + 1 teklif + kazandırma → funnel/winloss doğru).
 */
import "reflect-metadata";
import {
  DashboardAnalyticsService,
  deltaPct,
  monthWindows,
  previousWindow,
} from "../../src/modules/company-dashboard/dashboard-analytics.service";
import type { PrismaService } from "../../src/common/prisma/prisma.service";
import { prisma, truncateAll } from "./test-db";
import { makeBid, makeCompanyWithUser, makeItem, makeListing } from "./factories";

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

  it("money bloğu (Faz 4): dönem harcaması + açık taahhüt TRY-only hesaplanır", async () => {
    const buyer = await makeCompanyWithUser(prisma, {});
    const seller = await makeCompanyWithUser(prisma, {});
    // Dönem içi TRY sipariş (ödenmemiş) + USD sipariş (money'e girmez).
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
    expect(sa.money.periodSpend).toBe(5000);
    expect(sa.money.openCommitment).toBe(5000); // ödeme yok → tamamı taahhüt
    expect(sa.money.dueIn30d).toBe(0); // teslim yok → vade türetilemez
    expect(sa.money.realizedSavings).toBe(0);
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
