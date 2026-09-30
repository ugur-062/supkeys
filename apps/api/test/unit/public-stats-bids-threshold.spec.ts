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
