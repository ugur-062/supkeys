import { Prisma } from "@prisma/client";
import { prisma, truncateAll } from "./test-db";
import { makeCompanyWithUser, makeListing, makeItem } from "./factories";
import { CompanyDashboardService } from "../../src/modules/company-dashboard/company-dashboard.service";

/**
 * Arayüz testi webC-04 / D-297 — "En Yüksek Tasarruflu 5 Satın Alma Talebim"
 * tasarrufu OLMAYAN (0,00) talepleri sıralamaz; analitiğin `topSavings`'i ile
 * aynı kural. Eskiden kazandırılmış her talep (tasarruf 0 olsa da) listeye
 * giriyor, panoda 5 adet 0,00 ₺ ve boş grafik çıkıyordu.
 */
describe("Arayüz testi webC-04 — tasarruf top-5", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  const makeDashboard = () =>
    new CompanyDashboardService(
      prisma as never,
      { getRateOnDate: jest.fn().mockResolvedValue(40) } as never,
    );

  /** Kazandırılmış ALIM talebi: tek kalem, hedef fiyat `target`, kazanan birim fiyat 80. */
  async function awarded(buyer: Awaited<ReturnType<typeof makeCompanyWithUser>>, title: string, target: number) {
    const seller = await makeCompanyWithUser(prisma);
    const listing = await makeListing(prisma, {
      companyId: buyer.company.id,
      createdById: buyer.user.id,
      type: "ALIM",
      status: "AWARDED",
      primaryCurrency: "TRY",
      awardedAt: new Date(),
      title,
    });
    const item = await makeItem(prisma, listing.id, {
      quantity: new Prisma.Decimal(10),
      targetPrice: new Prisma.Decimal(target),
    });
    const bid = await prisma.listingBid.create({
      data: {
        listingId: listing.id,
        bidderCompanyId: seller.company.id,
        createdById: seller.user.id,
        amount: new Prisma.Decimal(800),
        currency: "TRY",
        status: "WON",
      },
    });
    await prisma.listingBidItem.create({
      data: { bidId: bid.id, itemId: item.id, unitPrice: new Prisma.Decimal(80) },
    });
  }

  it("0 tasarruflu talep listeye girmez; tasarruflu talep sıra 1", async () => {
    const buyer = await makeCompanyWithUser(prisma);
    await awarded(buyer, "Tasarruflu", 100); // (100 − 80) × 10 = 200
    await awarded(buyer, "Sifir", 80); // hedef = kazanan → 0

    const res = await makeDashboard().satinalmaTasarruf({ companyId: buyer.company.id } as never);

    expect(res.topSavingsYear).toHaveLength(1);
    expect(res.topSavingsYear[0]).toMatchObject({ rank: 1, title: "Tasarruflu" });
    expect(res.topSavingsYear[0]!.amount).toBeCloseTo(200, 5);
    // Hacim yine iki talebi de sayar (yalnız sıralama süzülür).
    expect(res.year.totalVolume).toBeCloseTo(1600, 5);
  });

  it("hiç tasarruf yoksa liste boş (web boş durum çizer)", async () => {
    const buyer = await makeCompanyWithUser(prisma);
    await awarded(buyer, "Sifir", 80);
    const res = await makeDashboard().satinalmaTasarruf({ companyId: buyer.company.id } as never);
    expect(res.topSavingsYear).toEqual([]);
    expect(res.topSavingsMonth).toEqual([]);
  });
});
