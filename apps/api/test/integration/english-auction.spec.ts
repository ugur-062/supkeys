/**
 * İngiliz Usulü (açık eksiltme) — fiyat azaltma kuralı (Decimal, F7) ve
 * otomatik uzatma. Kalemsiz ilan → placeBid dto.amount kullanır.
 */
import { prisma, truncateAll } from "./test-db";
import { makeBid, makeCompanyWithUser, makeListing } from "./factories";
import { makeService } from "./make-service";

const FUTURE = new Date(Date.now() + 7 * 24 * 3600 * 1000);

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

async function auction(over: Record<string, unknown> = {}) {
  const { service } = makeService();
  const owner = await makeCompanyWithUser(prisma, { country: "TR" });
  const bidder = await makeCompanyWithUser(prisma, { country: "TR" });
  const listing = await makeListing(prisma, {
    companyId: owner.company.id,
    createdById: owner.user.id,
    type: "ALIM",
    status: "OPEN",
    visibility: "PUBLIC",
    format: "ENGLISH_AUCTION",
    closesAt: FUTURE,
    ...over,
  });
  return { service, owner, bidder, listing };
}

const submit = (amount: number) =>
  ({
    amount,
    deliveryDate: FUTURE.toISOString(),
    validityDays: 30,
  }) as never;

describe("İngiliz Usulü — azaltma kuralı", () => {
  it("BEST_BID + AMOUNT: en iyiyi en az adım kadar geçmeli", async () => {
    const { service, owner, bidder, listing } = await auction({
      priceDecrementBasis: "BEST_BID",
      priceDecrementType: "AMOUNT",
      priceDecrementValue: "50",
    });
    const rival = await makeCompanyWithUser(prisma, { country: "TR" });
    await makeBid(prisma, {
      listingId: listing.id,
      bidderCompanyId: rival.company.id,
      createdById: rival.user.id,
      amount: 1000,
    });
    // maxAllowed = 1000 - 50 = 950
    await expect(
      service.placeBid(bidder.auth, listing.id, submit(951)),
    ).rejects.toThrow(/usul/i);
    await expect(
      service.placeBid(bidder.auth, listing.id, submit(950)),
    ).resolves.toBeDefined();
  });

  it("BEST_BID + PERCENT: adım = en iyi × yüzde", async () => {
    const { service, owner, bidder, listing } = await auction({
      priceDecrementBasis: "BEST_BID",
      priceDecrementType: "PERCENT",
      priceDecrementValue: "10",
    });
    const rival = await makeCompanyWithUser(prisma, { country: "TR" });
    await makeBid(prisma, {
      listingId: listing.id,
      bidderCompanyId: rival.company.id,
      createdById: rival.user.id,
      amount: 1000,
    });
    // maxAllowed = 1000 - (1000*10/100) = 900
    await expect(
      service.placeBid(bidder.auth, listing.id, submit(901)),
    ).rejects.toThrow();
    await expect(
      service.placeBid(bidder.auth, listing.id, submit(900)),
    ).resolves.toBeDefined();
  });

  it("OWN_LAST_BID: referans kendi son teklifi (en iyi değil)", async () => {
    const { service, bidder, listing } = await auction({
      priceDecrementBasis: "OWN_LAST_BID",
      priceDecrementType: "AMOUNT",
      priceDecrementValue: "50",
    });
    // başka firma çok daha düşük teklif vermiş (best=800)
    const rival = await makeCompanyWithUser(prisma, { country: "TR" });
    await makeBid(prisma, {
      listingId: listing.id,
      bidderCompanyId: rival.company.id,
      createdById: rival.user.id,
      amount: 800,
    });
    // bidder'ın kendi mevcut teklifi 1000
    await makeBid(prisma, {
      listingId: listing.id,
      bidderCompanyId: bidder.company.id,
      createdById: bidder.user.id,
      amount: 1000,
    });
    // ref=1000 (kendi), maxAllowed=950 → 940 kabul (BEST_BID olsaydı ref=800,
    // maxAllowed=750 olur ve 940 reddedilirdi).
    await expect(
      service.placeBid(bidder.auth, listing.id, submit(940)),
    ).resolves.toBeDefined();
    // Artık kendi son teklifi 940 → maxAllowed=890; 960 > 890 reddedilir.
    await expect(
      service.placeBid(bidder.auth, listing.id, submit(960)),
    ).rejects.toThrow();
  });

  it("ilk teklif (referans yok) herhangi bir tutarda kabul", async () => {
    const { service, bidder, listing } = await auction({
      priceDecrementBasis: "BEST_BID",
      priceDecrementType: "AMOUNT",
      priceDecrementValue: "50",
    });
    await expect(
      service.placeBid(bidder.auth, listing.id, submit(99999)),
    ).resolves.toBeDefined();
  });
});

describe("İngiliz Usulü — otomatik uzatma", () => {
  it("kapanışa yakın gelen teklif kapanışı ileri atar", async () => {
    const soon = new Date(Date.now() + 2 * 60 * 1000); // 2 dk sonra
    const { service, bidder, listing } = await auction({
      closesAt: soon,
      autoExtendOnLateBid: true,
      autoExtendThresholdMin: 10,
      autoExtendByMinutes: 30,
    });
    await service.placeBid(bidder.auth, listing.id, submit(500));
    const after = await prisma.listing.findUniqueOrThrow({
      where: { id: listing.id },
    });
    expect(after.closesAt!.getTime()).toBeGreaterThan(soon.getTime());
  });
});
