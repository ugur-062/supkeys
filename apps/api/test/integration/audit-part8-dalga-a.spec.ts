/**
 * Denetim 2026-08-25 Parça 8 (Onay/rapor/pano/şablon/kategori) — Dalga A.
 * Rapor: docs/audit-2026-08-25-part8-approvals-reports.md
 */
import { Prisma } from "@rothern/db";
import {
  bidRateToTry,
  itemUnitPriceTry,
  listingAmountTry,
} from "../../src/common/company/report-currency";
import { makeService } from "./make-service";
import { makeBid, makeCompanyWithUser, makeItem, makeListing } from "./factories";
import { prisma, truncateAll } from "./test-db";

const FUTURE = new Date(Date.now() + 7 * 86_400_000);
const PAST = new Date(Date.now() - 3600_000);

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

describe("#1 — rapor/pano kalem hesabı TEK BAZ (TRY)", () => {
  it("kalem birim fiyatı teklifin damgasıyla çevrilir; damga yoksa null (fail-closed)", () => {
    const bidUsd = { currency: "USD", exchangeRateSnapshot: 40 };
    expect(itemUnitPriceTry(bidUsd, { unitPrice: 30 })).toBe(1200);
    // Kalem kendi biriminde (madde 9): fxToBase × ana birim damgası.
    expect(
      itemUnitPriceTry(bidUsd, {
        unitPrice: 10,
        currency: "EUR",
        fxToBase: 1.1,
      }),
    ).toBeCloseTo(440);
    // Damga yok → hesaba katılmaz ("0 TL kazanan" uydurma tasarruf üretmesin).
    expect(
      itemUnitPriceTry(
        { currency: "USD", exchangeRateSnapshot: null },
        { unitPrice: 30 },
      ),
    ).toBeNull();
    expect(bidRateToTry({ currency: "TRY", exchangeRateSnapshot: null })).toBe(1);
  });

  it("ilan birimindeki referans (hedef/taban) da TRY'ye çevrilir", () => {
    expect(listingAmountTry("TRY", 1000, 1)).toBe(1000);
    expect(listingAmountTry("USD", 100, 40)).toBe(4000);
    expect(listingAmountTry("USD", 100, null)).toBeNull();
  });

  it("TRY ilan + USD kazanan: tasarruf uydurulmaz (aşım doğru görülür)", async () => {
    const { service } = makeService();
    void service;
    const { CompanyReportsService } = await import(
      "../../src/modules/company-reports/company-reports.service"
    );
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const bidder = await makeCompanyWithUser(prisma, { country: "TR" });
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      status: "AWARDED",
      format: "RFQ",
      visibility: "PUBLIC",
      closesAt: PAST,
      primaryCurrency: "TRY",
      allowedCurrencies: ["TRY", "USD"] as never,
    } as never);
    await prisma.listing.update({
      where: { id: listing.id },
      data: { awardedAt: new Date() },
    });
    // Hedef ₺1.000/adet × 100 adet = ₺100.000
    const item = await makeItem(prisma, listing.id, {
      quantity: new Prisma.Decimal(100),
      targetPrice: new Prisma.Decimal(1000),
    });
    // Kazanan 30 USD/adet, kur 40 → ₺1.200/adet = ₺120.000 (yani AŞIM)
    const bid = await makeBid(prisma, {
      listingId: listing.id,
      bidderCompanyId: bidder.company.id,
      createdById: bidder.user.id,
      amount: 3000,
      currency: "USD",
      status: "WON",
      items: [{ itemId: item.id, unitPrice: 30 }],
    });
    await prisma.listingBid.update({
      where: { id: bid.id },
      data: { exchangeRateSnapshot: new Prisma.Decimal(40) },
    });

    const svc = new CompanyReportsService(prisma as never);
    const res = (await svc.savings(owner.company.id, {
      rangeStart: new Date(Date.now() - 86_400_000).toISOString(),
      rangeEnd: new Date(Date.now() + 86_400_000).toISOString(),
    } as never)) as {
      rows: { items: { delta: number | null }[]; actualTotal: number }[];
      summary: { grandActual: number; grandTarget: number };
    };
    expect(res.rows).toHaveLength(1);
    // ₺120.000 gerçek maliyet (eskiden 3.000 sayılıyordu → 40 kat sapma)
    expect(res.summary.grandActual).toBe(120_000);
    // Hedef ₺100.000 → gerçek hedefin ÜSTÜNDE (tasarruf değil aşım).
    expect(res.summary.grandTarget).toBe(100_000);
    expect(res.summary.grandTarget - res.summary.grandActual).toBe(-20_000);
  });
});

describe("#2 — yanıt oranı %100'ü aşmaz (payda davetliler, pay davetli yanıtları)", () => {
  it("1 davetli + 2 davetsiz teklif → %0 veya %100, asla %300", async () => {
    const { CompanyReportsService } = await import(
      "../../src/modules/company-reports/company-reports.service"
    );
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const invited = await makeCompanyWithUser(prisma, { country: "TR" });
    const outsider1 = await makeCompanyWithUser(prisma, { country: "TR" });
    const outsider2 = await makeCompanyWithUser(prisma, { country: "TR" });
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      status: "IN_AWARD",
      format: "RFQ",
      visibility: "PUBLIC",
      closesAt: PAST,
    });
    await prisma.listingInvitation.create({
      data: {
        listingId: listing.id,
        invitedCompanyId: invited.company.id,
        invitedById: owner.user.id,
      },
    });
    for (const c of [invited, outsider1, outsider2]) {
      await makeBid(prisma, {
        listingId: listing.id,
        bidderCompanyId: c.company.id,
        createdById: c.user.id,
        amount: 100,
      });
    }
    const svc = new CompanyReportsService(prisma as never);
    const res = (await svc.general(owner.company.id, {
      mode: "SINGLE",
      listingId: listing.id,
    } as never)) as {
      listings: { responseRate: number | null; submittedBidCount: number }[];
    };
    expect(res.listings[0]!.responseRate).toBe(100);
    expect(res.listings[0]!.submittedBidCount).toBe(3);
  });
});

describe("#3 — pano ödeme evreni COMPLETED siparişleri içerir", () => {
  it("teslim alınmış (COMPLETED) ve vadesi geçmiş sipariş 'gecikmiş ödeme' sayılır", async () => {
    const { ActionCenterService } = await import(
      "../../src/modules/company-dashboard/action-center.service"
    );
    const buyer = await makeCompanyWithUser(prisma, { country: "TR" });
    const seller = await makeCompanyWithUser(prisma, { country: "TR" });
    await prisma.companyOrder.create({
      data: {
        sellerCompanyId: seller.company.id,
        buyerCompanyId: buyer.company.id,
        amount: new Prisma.Decimal(1000),
        currency: "TRY",
        status: "COMPLETED",
        paymentTiming: "AFTER_DELIVERY",
        paymentCategory: "DEFERRED",
        paymentDays: 1,
        deliveredAt: new Date(Date.now() - 10 * 86_400_000),
        completedAt: new Date(Date.now() - 10 * 86_400_000),
      } as never,
    });
    const svc = new ActionCenterService(prisma as never);
    const res = (await svc.satinalma(buyer.company.id)) as {
      rows: { key: string; count: number }[];
    };
    const overdue = res.rows.find((r) => r.key === "overduePayments");
    expect(overdue?.count).toBe(1);
  });
});

describe("#4 — kapanış tarihi istemciden kaldırılamaz", () => {
  it("ALIM ihalesi closesAt:null gönderilerek kapanışsız bırakılamaz", async () => {
    const { service } = makeService();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      status: "OPEN",
      format: "RFQ",
      visibility: "PUBLIC",
      closesAt: FUTURE,
    });
    await expect(
      service.updateListing(owner.auth, listing.id, {
        type: "ALIM",
        format: "RFQ",
        title: "Kapanışsız denemesi",
        closesAt: null,
        items: [{ name: "x", quantity: 1, unit: "adet" }],
      } as never),
    ).rejects.toThrow(/Kapanış tarihi zorunlu/);
    const after = await prisma.listing.findUniqueOrThrow({
      where: { id: listing.id },
    });
    expect(after.closesAt).not.toBeNull();
    expect(after.type).toBe("ALIM");
  });
});
