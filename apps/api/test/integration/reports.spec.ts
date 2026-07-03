/**
 * Raporlama motoru (eski sistem portu) — Genel (SINGLE/RANGE), Tasarruf/
 * Kazanç, Teklif Karşılaştırma. Tip-farkında hesaplar + kiracı izolasyonu +
 * kapalı zarf (yalnız sahip) doğrulanır.
 */
import { CompanyReportsService } from "../../src/modules/company-reports/company-reports.service";
import { ReportsExcelService } from "../../src/modules/company-reports/reports-excel.service";
import { prisma, truncateAll } from "./test-db";
import { makeBid, makeCompanyWithUser, makeItem, makeListing } from "./factories";

const svc = () => new CompanyReportsService(prisma as never);
const past = (days: number) =>
  new Date(Date.now() - days * 86_400_000).toISOString();
const future = (days: number) =>
  new Date(Date.now() + days * 86_400_000).toISOString();

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

/** AWARDED ALIM: kazanan 800 (hedef 900), kaybeden 1000 → tasarruf 200. */
async function awardedAlim(owner: {
  company: { id: string };
  user: { id: string };
}) {
  const s1 = await makeCompanyWithUser(prisma, { country: "TR" });
  const s2 = await makeCompanyWithUser(prisma, { country: "TR" });
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
  await prisma.listingInvitation.createMany({
    data: [
      {
        listingId: listing.id,
        invitedCompanyId: s1.company.id,
        invitedById: owner.user.id,
      },
      {
        listingId: listing.id,
        invitedCompanyId: s2.company.id,
        invitedById: owner.user.id,
      },
    ],
  });
  await makeBid(prisma, {
    listingId: listing.id,
    bidderCompanyId: s1.company.id,
    createdById: s1.user.id,
    amount: 800,
    status: "WON",
    items: [{ itemId: item.id, unitPrice: 800 }],
  });
  await makeBid(prisma, {
    listingId: listing.id,
    bidderCompanyId: s2.company.id,
    createdById: s2.user.id,
    amount: 1000,
    status: "LOST",
    items: [{ itemId: item.id, unitPrice: 1000 }],
  });
  return { listing, item, s1, s2 };
}

describe("Genel rapor", () => {
  it("SINGLE: numarayla çözer; satır katılım+tasarruf içerir; sahip-dışı 404", async () => {
    const service = svc();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const outsider = await makeCompanyWithUser(prisma, { country: "TR" });
    const { listing } = await awardedAlim(owner);

    const r = await service.general(owner.company.id, "ALIM", {
      mode: "SINGLE",
      listingId: listing.id,
    });
    expect(r.listings).toHaveLength(1);
    const row = r.listings[0]!;
    expect(row.invitedCount).toBe(2);
    expect(row.submittedBidCount).toBe(2);
    expect(row.responseRate).toBe(100);
    expect(row.winningTotal).toBe(800);
    expect(row.delta).toBe(200);
    expect(row.estimatedTotal).toBe(900);

    await expect(
      service.general(outsider.company.id, "ALIM", {
        mode: "SINGLE",
        listingId: listing.id,
      }),
    ).rejects.toThrow(/bulunamadı/);
  });

  it("RANGE: tarih aralığı + tip süzer; başka firmanın verisi karışmaz", async () => {
    const service = svc();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const other = await makeCompanyWithUser(prisma, { country: "TR" });
    await awardedAlim(owner);
    await awardedAlim(other);

    const r = await service.general(owner.company.id, "ALIM", {
      mode: "RANGE",
      rangeStart: past(7),
      rangeEnd: future(1),
    });
    expect(r.listings).toHaveLength(1);
    expect(r.summary.totalListings).toBe(1);
    expect(r.summary.totalAwardedValue).toBe(800);
    expect(r.summary.totalDelta).toBe(200);

    // Aralık dışı → boş.
    const empty = await service.general(owner.company.id, "ALIM", {
      mode: "RANGE",
      rangeStart: past(30),
      rangeEnd: past(14),
    });
    expect(empty.listings).toHaveLength(0);
  });
});

describe("Tasarruf/Kazanç raporu", () => {
  it("ALIM: tasarruf = en yüksek − kazanan; kalem detayı hedef-vs-kazanan", async () => {
    const service = svc();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    await awardedAlim(owner);

    const r = await service.savings(owner.company.id, "ALIM", {
      rangeStart: past(7),
      rangeEnd: future(1),
    });
    expect(r.rows).toHaveLength(1);
    const row = r.rows[0]!;
    expect(row.highestBid).toBe(1000);
    expect(row.winningTotal).toBe(800);
    expect(row.delta).toBe(200);
    expect(row.items[0]!.referenceUnitPrice).toBe(900);
    expect(row.items[0]!.winningUnitPrice).toBe(800);
    expect(row.items[0]!.delta).toBe(100); // hedef 900 − kazanan 800
    expect(r.summary.grandDelta).toBe(200);
  });

  it("SATIS: kazanç = kazanan − en düşük; kalem referansı taban", async () => {
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
    });
    const item = await makeItem(prisma, listing.id, {
      quantity: 1,
      minUnitPrice: 1000,
    } as never);
    await makeBid(prisma, {
      listingId: listing.id,
      bidderCompanyId: b1.company.id,
      createdById: b1.user.id,
      amount: 1500,
      status: "WON",
      items: [{ itemId: item.id, unitPrice: 1500 }],
    });
    await makeBid(prisma, {
      listingId: listing.id,
      bidderCompanyId: b2.company.id,
      createdById: b2.user.id,
      amount: 1100,
      status: "LOST",
      items: [{ itemId: item.id, unitPrice: 1100 }],
    });

    const r = await service.savings(owner.company.id, "SATIS", {
      rangeStart: past(7),
      rangeEnd: future(1),
    });
    const row = r.rows[0]!;
    expect(row.lowestBid).toBe(1100);
    expect(row.winningTotal).toBe(1500);
    expect(row.delta).toBe(400); // kazanan − en düşük
    expect(row.items[0]!.referenceUnitPrice).toBe(1000); // taban
    expect(row.items[0]!.delta).toBe(500); // kazanan − taban
  });
});

describe("Teklif Karşılaştırma raporu", () => {
  it("matris: en iyi birim vurgusu, sıra, önerilen kazanan; teklif vermeyen davetli opsiyonel", async () => {
    const service = svc();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const { listing, item, s1, s2 } = await awardedAlim(owner);
    // Teklif vermeyen üçüncü davetli.
    const s3 = await makeCompanyWithUser(prisma, { country: "TR" });
    await prisma.listingInvitation.create({
      data: {
        listingId: listing.id,
        invitedCompanyId: s3.company.id,
        invitedById: owner.user.id,
      },
    });

    const r = await service.bidComparison(owner.company.id, "ALIM", {
      listingId: listing.id,
      criteria: "PRICE",
      includeNonBidders: false,
    });
    expect(r.parties).toHaveLength(2);
    const p1 = r.parties.find((p) => p.companyId === s1.company.id)!;
    const p2 = r.parties.find((p) => p.companyId === s2.company.id)!;
    expect(p1.rank).toBe(1); // ALIM: en ucuz = 1
    expect(p2.rank).toBe(2);
    expect(p1.itemPrices[0]!.isBest).toBe(true);
    expect(p2.itemPrices[0]!.isBest).toBe(false);
    expect(r.items[0]!.bestUnitPrice).toBe(800);
    expect(r.recommendedAwards[0]!.companyName).toBeTruthy();
    expect(r.recommendedAwards[0]!.unitPrice).toBe(800);
    // Hedefe göre tasarruf (hedef 900 − kazanan 800 = 100).
    expect(p1.deltaVsReference).toBe(100);

    const withNon = await service.bidComparison(owner.company.id, "ALIM", {
      listingId: listing.id,
      criteria: "PRICE",
      includeNonBidders: true,
    });
    expect(withNon.parties).toHaveLength(3);
    const noBid = withNon.parties.find((p) => p.companyId === s3.company.id)!;
    expect(noBid.submitted).toBe(false);
    expect(noBid.status).toBe("NO_BID");
    void item;
  });

  it("Excel çıktıları üç rapor için de üretilir (buffer)", async () => {
    const service = svc();
    const excel = new ReportsExcelService();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const { listing } = await awardedAlim(owner);

    const g = await service.general(owner.company.id, "ALIM", {
      mode: "SINGLE",
      listingId: listing.id,
    });
    const s = await service.savings(owner.company.id, "ALIM", {
      rangeStart: past(7),
      rangeEnd: future(1),
    });
    const c = await service.bidComparison(owner.company.id, "ALIM", {
      listingId: listing.id,
      criteria: "BOTH",
    });
    const [gb, sb, cb] = await Promise.all([
      excel.general(g),
      excel.savings(s),
      excel.bidComparison(c),
    ]);
    // xlsx = zip → "PK" imzası.
    for (const buf of [gb, sb, cb]) {
      expect(buf.length).toBeGreaterThan(1000);
      expect(buf.subarray(0, 2).toString()).toBe("PK");
    }
  });
});
