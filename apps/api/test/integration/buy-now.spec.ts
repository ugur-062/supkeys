/**
 * buyNow (Hemen-Al) — SATIS ilanında tavan fiyattan teklif. Kapılar: tip,
 * ülke (F2), kapanış (F3). Direkt sipariş DEĞİL — isBuyNow bayraklı teklif.
 */
import { prisma, truncateAll } from "./test-db";
import { makeCompanyWithUser, makeListing } from "./factories";
import { makeService } from "./make-service";

const FUTURE = new Date(Date.now() + 7 * 24 * 3600 * 1000);
const PAST = new Date(Date.now() - 3600 * 1000);

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

async function satisListing(over: Record<string, unknown> = {}) {
  const { service } = makeService();
  const owner = await makeCompanyWithUser(prisma, { country: "TR" });
  const buyer = await makeCompanyWithUser(prisma, { country: "TR" });
  const listing = await makeListing(prisma, {
    companyId: owner.company.id,
    createdById: owner.user.id,
    type: "SATIS",
    status: "OPEN",
    visibility: "PUBLIC",
    buyNowPrice: "5000",
    closesAt: FUTURE,
    ...over,
  });
  return { service, owner, buyer, listing };
}

describe("buyNow", () => {
  it("SATIS + buyNowPrice: isBuyNow teklif oluşturur (tutar = tavan)", async () => {
    const { service, buyer, listing } = await satisListing();
    const res = (await service.buyNow(buyer.auth, listing.id)) as {
      amount: string;
      status: string;
    };
    expect(res.amount).toBe("5000");
    const stored = await prisma.listingBid.findFirstOrThrow({
      where: { listingId: listing.id, bidderCompanyId: buyer.company.id },
    });
    expect(stored.isBuyNow).toBe(true);
  });

  it("ALIM ilanında hemen-al yok", async () => {
    const { service } = makeService();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const buyer = await makeCompanyWithUser(prisma, { country: "TR" });
    const alim = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      status: "OPEN",
      visibility: "PUBLIC",
      closesAt: FUTURE,
    });
    await expect(service.buyNow(buyer.auth, alim.id)).rejects.toThrow(
      /hemen-al/i,
    );
  });

  it("yanlış ülkeden hemen-al yapılamaz (F2)", async () => {
    const { service, listing } = await satisListing();
    const foreign = await makeCompanyWithUser(prisma, { country: "DE" });
    await expect(service.buyNow(foreign.auth, listing.id)).rejects.toThrow();
  });

  it("kapanış geçmişse hemen-al yapılamaz (F3)", async () => {
    const { service, buyer, listing } = await satisListing({ closesAt: PAST });
    await expect(service.buyNow(buyer.auth, listing.id)).rejects.toThrow(
      /süre|kapal/i,
    );
  });
});
