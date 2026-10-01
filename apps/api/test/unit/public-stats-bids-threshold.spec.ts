/**
 * `/public/stats` — son 24 saat teklif sayısı anonim uçta ancak yeterince açık
 * talep varken döner (derin denetim LU-18). Tek açık talepte sayı o talebin
 * kapalı zarftaki teklif sayısını ele veriyordu.
 */
import {
  PUBLIC_BIDS_METRIC_MIN_OPEN_DEMANDS,
  PublicMarketplaceService,
} from "../../src/modules/public-marketplace/public-marketplace.service";

function serviceWith(openDemands: number, bids: number) {
  const prisma = {
    companyItem: { count: jest.fn().mockResolvedValue(100), findMany: jest.fn().mockResolvedValue([]) },
    company: { count: jest.fn().mockResolvedValue(30) },
    category: { count: jest.fn().mockResolvedValue(5), findMany: jest.fn().mockResolvedValue([]) },
    listing: { count: jest.fn().mockResolvedValue(openDemands) },
    listingBid: { count: jest.fn().mockResolvedValue(bids) },
  };
  return new PublicMarketplaceService(prisma as never);
}

describe("public stats — teklif sayısı eşiği", () => {
  it("açık talep eşiğin altındaysa bidsLast24h 0 döner", async () => {
    const st = await serviceWith(1, 3).stats();
    expect(st.openDemands).toBe(1);
    expect(st.bidsLast24h).toBe(0);
    expect((await serviceWith(PUBLIC_BIDS_METRIC_MIN_OPEN_DEMANDS - 1, 7).stats()).bidsLast24h).toBe(0);
  });

  it("eşik ve üstünde gerçek sayı döner", async () => {
    expect((await serviceWith(PUBLIC_BIDS_METRIC_MIN_OPEN_DEMANDS, 7).stats()).bidsLast24h).toBe(7);
  });
});

describe("public stats — ürünü olan kategori sayısı (arayüz testi D-077)", () => {
  it("keşifteki tüm segmentleri değil, yayındaki ürünlerin segmentlerini sayar", async () => {
    const categoryCount = jest.fn().mockResolvedValue(2);
    const prisma = {
      companyItem: {
        count: jest.fn().mockResolvedValue(3),
        findMany: jest
          .fn()
          .mockResolvedValue([{ categoryId: "39121000" }, { categoryId: "39131700" }, { categoryId: "72101500" }, { categoryId: null }, { categoryId: "39" }]),
      },
      company: { count: jest.fn().mockResolvedValue(1) },
      category: { count: categoryCount, findMany: jest.fn().mockResolvedValue([]) },
      listing: { count: jest.fn().mockResolvedValue(0) },
      listingBid: { count: jest.fn().mockResolvedValue(0) },
    };
    const st = await new PublicMarketplaceService(prisma as never).stats();
    expect(st.categories).toBe(2);
    expect(categoryCount).toHaveBeenCalledTimes(1);
    const where = categoryCount.mock.calls[0][0].where;
    expect([...where.id.in].sort()).toEqual(["39000000", "72000000"]);
  });

  it("yayında ürün yoksa sorgusuz 0", async () => {
    const categoryCount = jest.fn().mockResolvedValue(29);
    const prisma = {
      companyItem: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
      company: { count: jest.fn().mockResolvedValue(0) },
      category: { count: categoryCount, findMany: jest.fn().mockResolvedValue([]) },
      listing: { count: jest.fn().mockResolvedValue(0) },
      listingBid: { count: jest.fn().mockResolvedValue(0) },
    };
    expect((await new PublicMarketplaceService(prisma as never).stats()).categories).toBe(0);
    expect(categoryCount).not.toHaveBeenCalled();
  });
});
