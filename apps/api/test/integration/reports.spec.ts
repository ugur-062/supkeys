/**
 * Raporlar servisi — tip-farkında (ALIM tasarruf / SATIS kazanç) hesaplar,
 * aylık eğilim, karşı taraf kırılımı, sipariş özeti ve ihale-bazlı rapor.
 * Çok-kiracılı izolasyon + sahiplik guard'ı da doğrulanır.
 */
import { CompanyReportsService } from "../../src/modules/company-reports/company-reports.service";
import { prisma, truncateAll } from "./test-db";
import { makeBid, makeCompanyWithUser, makeItem, makeListing } from "./factories";

const svc = () => new CompanyReportsService(prisma as never);

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

/** AWARDED bir ALIM ihalesi: kazanan 800, kaybeden 1000 (tasarruf 200). */
async function awardedAlim(owner: {
  company: { id: string };
  user: { id: string };
}) {
  const seller1 = await makeCompanyWithUser(prisma, { country: "TR" });
  const seller2 = await makeCompanyWithUser(prisma, { country: "TR" });
  const listing = await makeListing(prisma, {
    companyId: owner.company.id,
    createdById: owner.user.id,
    type: "ALIM",
    status: "AWARDED",
    awardedAt: new Date(),
  });
  const item = await makeItem(prisma, listing.id, {
    quantity: 1,
    targetPrice: 900,
  } as never);
  await makeBid(prisma, {
    listingId: listing.id,
    bidderCompanyId: seller1.company.id,
    createdById: seller1.user.id,
    amount: 800,
    status: "WON",
    items: [{ itemId: item.id, unitPrice: 800 }],
  });
  await makeBid(prisma, {
    listingId: listing.id,
    bidderCompanyId: seller2.company.id,
    createdById: seller2.user.id,
    amount: 1000,
    status: "LOST",
    items: [{ itemId: item.id, unitPrice: 1000 }],
  });
  return { listing, item, seller1, seller2 };
}

describe("general + savings — ALIM (tasarruf)", () => {
  it("tasarruf = en yüksek − kazanan; başka firmanın verisi karışmaz", async () => {
    const service = svc();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const other = await makeCompanyWithUser(prisma, { country: "TR" });
    await awardedAlim(owner);
    await awardedAlim(other); // izolasyon: sayılara girmemeli

    const g = await service.general(owner.company.id, "ALIM");
    expect(g.total).toBe(1);
    expect(g.awardedCount).toBe(1);
    expect(g.totalAwarded).toBe(800);
    expect(g.totalCompetitionDelta).toBe(200);
    expect(g.totalEstimated).toBe(900); // hedef fiyat × miktar

    const s = await service.savings(owner.company.id, "ALIM");
    expect(s.rows).toHaveLength(1);
    expect(s.rows[0]!.reference).toBe(1000);
    expect(s.rows[0]!.winning).toBe(800);
    expect(s.rows[0]!.delta).toBe(200);
    expect(s.grandDelta).toBe(200);
  });
});

describe("general + savings — SATIS (rekabet kazancı)", () => {
  it("kazanç = kazanan − en düşük; taban üstü fark hesaplanır", async () => {
    const service = svc();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const b1 = await makeCompanyWithUser(prisma, { country: "TR" });
    const b2 = await makeCompanyWithUser(prisma, { country: "TR" });
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "SATIS",
      status: "AWARDED",
      awardedAt: new Date(),
      minPrice: 1000,
    } as never);
    await makeBid(prisma, {
      listingId: listing.id,
      bidderCompanyId: b1.company.id,
      createdById: b1.user.id,
      amount: 1500,
      status: "WON",
    });
    await makeBid(prisma, {
      listingId: listing.id,
      bidderCompanyId: b2.company.id,
      createdById: b2.user.id,
      amount: 1100,
      status: "LOST",
    });

    const g = await service.general(owner.company.id, "SATIS");
    expect(g.totalAwarded).toBe(1500);
    expect(g.totalCompetitionDelta).toBe(400); // 1500 − 1100

    const s = await service.savings(owner.company.id, "SATIS");
    expect(s.rows[0]!.reference).toBe(1100); // en düşük teklif
    expect(s.rows[0]!.delta).toBe(400);
    expect(s.rows[0]!.overFloor).toBe(500); // 1500 − taban 1000
  });

  it("kur snapshot'lı yabancı teklif TRY karşılığıyla toplanır", async () => {
    const service = svc();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const b1 = await makeCompanyWithUser(prisma, { country: "TR" });
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "SATIS",
      status: "AWARDED",
      awardedAt: new Date(),
      minPrice: 100,
    } as never);
    const bid = await makeBid(prisma, {
      listingId: listing.id,
      bidderCompanyId: b1.company.id,
      createdById: b1.user.id,
      amount: 100,
      status: "WON",
    });
    await prisma.listingBid.update({
      where: { id: bid.id },
      data: { currency: "USD", exchangeRateSnapshot: 40 },
    });

    const g = await service.general(owner.company.id, "SATIS");
    expect(g.totalAwarded).toBe(4000); // 100 USD × 40
  });
});

describe("monthly + counterparties + ordersSummary", () => {
  it("aylık satır kazandırma ayına yazılır; sipariş kırılımı karşı tarafa gruplanır", async () => {
    const service = svc();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const { listing, seller1 } = await awardedAlim(owner);
    await prisma.companyOrder.create({
      data: {
        listingId: listing.id,
        sellerCompanyId: seller1.company.id,
        buyerCompanyId: owner.company.id,
        amount: 800,
        currency: "TRY",
        status: "COMPLETED",
      },
    });

    const months = await service.monthly(owner.company.id, "ALIM");
    const thisMonth = months.find((m) => m.awarded === 1);
    expect(thisMonth).toBeDefined();
    expect(thisMonth!.awardedTry).toBe(800);

    const cps = await service.counterparties(owner.company.id, "ALIM");
    expect(cps).toHaveLength(1);
    expect(cps[0]!.orderCount).toBe(1);
    expect(cps[0]!.totals.TRY).toBe(800);

    const os = await service.ordersSummary(owner.company.id, "ALIM");
    expect(os.total).toBe(1);
    expect(os.byStatus.COMPLETED).toBe(1);
    expect(os.totals.TRY).toBe(800);
  });
});

describe("listingReport — ihale bazlı", () => {
  it("katılım/istatistik/kalem kırılımı doğru; sahip-dışı erişim reddedilir", async () => {
    const service = svc();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const outsider = await makeCompanyWithUser(prisma, { country: "TR" });
    const { listing, item, seller1 } = await awardedAlim(owner);
    await prisma.listingInvitation.create({
      data: {
        listingId: listing.id,
        invitedCompanyId: seller1.company.id,
        invitedById: owner.user.id,
      },
    });

    const r = await service.listingReport(owner.company.id, listing.id);
    expect(r.participation.invited).toBe(1);
    expect(r.participation.bidders).toBe(2);
    expect(r.participation.invitedBidders).toBe(1);
    expect(r.bidStats.min).toBe(800);
    expect(r.bidStats.max).toBe(1000);
    expect(r.bidStats.winning).toBe(800);
    expect(r.bidStats.delta).toBe(200);
    const it0 = r.items.find((i) => i.id === item.id)!;
    expect(it0.offerCount).toBe(2);
    expect(it0.bestUnitPrice).toBe(800); // ALIM: en düşük birim
    expect(it0.winningUnitPrice).toBe(800);

    await expect(
      service.listingReport(outsider.company.id, listing.id),
    ).rejects.toThrow(/ilan sahibi/);
  });
});
