/**
 * İlan durum-makinesi yarış testleri (Tur-3 denetimi #1/#5/#11, INV-SM-1).
 *
 * Üç metot koşulsuz `listing.update` yerine koşullu-atomik `updateMany` + count
 * guard'ı kullanır (closeNoAward/award simetrisi). Buradaki testler guard'ın
 * gerçek eşzamanlılıkta (Promise.allSettled, izole rothern_test şeması) ve
 * bayat-okuma senaryosunda doğru davrandığını kanıtlar.
 */
import { prisma, truncateAll } from "./test-db";
import { makeBid, makeCompanyWithUser, makeItem, makeListing } from "./factories";
import { makeService } from "./make-service";

const FUTURE = new Date(Date.now() + 7 * 24 * 3600 * 1000);

const nextRoundDto = (over: Record<string, unknown> = {}) =>
  ({
    type: "RFQ",
    carryBids: "NONE",
    eliminateNonBidders: false,
    closesAt: FUTURE.toISOString(),
    bidVisibility: "OWN_ONLY",
    ...over,
  }) as never;

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

// OPEN ALIM ilanı + sahip + SUBMITTED tek teklif.
async function openAlimWithBid() {
  const { service } = makeService();
  const owner = await makeCompanyWithUser(prisma, { country: "TR" });
  const bidder = await makeCompanyWithUser(prisma, { country: "TR" });
  const listing = await makeListing(prisma, {
    companyId: owner.company.id,
    createdById: owner.user.id,
    type: "ALIM",
    status: "OPEN",
    visibility: "PUBLIC",
    closesAt: FUTURE,
  });
  const item = await makeItem(prisma, listing.id);
  const bid = await makeBid(prisma, {
    listingId: listing.id,
    bidderCompanyId: bidder.company.id,
    createdById: bidder.user.id,
    amount: 1000,
    items: [{ itemId: item.id, unitPrice: 1000 }],
  });
  return { service, owner, bidder, listing, item, bid };
}

describe("#1 createNextRound — koşullu-atomik durum guard'ı", () => {
  it("award SONRASI createNextRound reddedilir → tek sipariş, ilan AWARDED, tur değişmez", async () => {
    const { service, owner, listing, bid } = await openAlimWithBid();
    await service.award(owner.auth, listing.id, bid.id);

    await expect(
      service.createNextRound(owner.auth, listing.id, nextRoundDto()),
    ).rejects.toThrow();

    const after = await prisma.listing.findUniqueOrThrow({
      where: { id: listing.id },
      select: { status: true, currentRound: true },
    });
    expect(after.status).toBe("AWARDED");
    expect(after.currentRound).toBe(listing.currentRound); // +1 EZİLMEDİ
    const orders = await prisma.companyOrder.findMany({
      where: { listingId: listing.id },
    });
    expect(orders).toHaveLength(1);
  });

  it("eşzamanlı iki createNextRound → tam 1 başarılı, tur +1 (self-race'te +2 DEĞİL)", async () => {
    const { service, owner, listing } = await openAlimWithBid();
    const start = listing.currentRound;

    const results = await Promise.allSettled([
      service.createNextRound(owner.auth, listing.id, nextRoundDto()),
      service.createNextRound(owner.auth, listing.id, nextRoundDto()),
    ]);
    const ok = results.filter((r) => r.status === "fulfilled").length;
    expect(ok).toBe(1);

    const after = await prisma.listing.findUniqueOrThrow({
      where: { id: listing.id },
      select: { currentRound: true },
    });
    expect(after.currentRound).toBe(start + 1); // +2 atlaması yok
  });

  it("eşzamanlı award + createNextRound → çift sipariş oluşmaz", async () => {
    const { service, owner, listing, bid } = await openAlimWithBid();
    await Promise.allSettled([
      service.award(owner.auth, listing.id, bid.id),
      service.createNextRound(owner.auth, listing.id, nextRoundDto()),
    ]);
    const orders = await prisma.companyOrder.findMany({
      where: { listingId: listing.id },
    });
    expect(orders.length).toBeLessThanOrEqual(1);
  });
});

describe("#5 cancel (ilan) — koşullu-atomik durum guard'ı", () => {
  it("award SONRASI cancel reddedilir → iptal bildirimi GÖNDERİLMEZ, sipariş canlı, ilan AWARDED", async () => {
    const { service, owner, listing, bid } = await openAlimWithBid();
    await service.award(owner.auth, listing.id, bid.id);

    const notifySpy = jest
      .spyOn(
        service as unknown as {
          notifyListingParticipants: (...a: unknown[]) => Promise<void>;
        },
        "notifyListingParticipants",
      )
      .mockResolvedValue(undefined);

    await expect(service.cancel(owner.auth, listing.id)).rejects.toThrow();
    expect(notifySpy).not.toHaveBeenCalled(); // yanıltıcı "iptal edildi" yok

    const after = await prisma.listing.findUniqueOrThrow({
      where: { id: listing.id },
      select: { status: true },
    });
    expect(after.status).toBe("AWARDED"); // CANCELLED'a ezilmedi
    const orders = await prisma.companyOrder.findMany({
      where: { listingId: listing.id },
    });
    expect(orders).toHaveLength(1);
    notifySpy.mockRestore();
  });

  it("eşzamanlı award + cancel → CANCELLED + canlı sipariş ASLA birlikte oluşmaz", async () => {
    const { service, owner, listing, bid } = await openAlimWithBid();
    await Promise.allSettled([
      service.award(owner.auth, listing.id, bid.id),
      service.cancel(owner.auth, listing.id),
    ]);
    const after = await prisma.listing.findUniqueOrThrow({
      where: { id: listing.id },
      select: { status: true },
    });
    const orders = await prisma.companyOrder.findMany({
      where: { listingId: listing.id },
    });
    // İki geçerli sonuç: (AWARDED + 1 sipariş) YA DA (CANCELLED + 0 sipariş).
    if (after.status === "CANCELLED") {
      expect(orders).toHaveLength(0);
    } else {
      expect(after.status).toBe("AWARDED");
      expect(orders).toHaveLength(1);
    }
  });
});

describe("#11 publishListing — koşullu-atomik durum guard'ı", () => {
  async function draftListing() {
    const { service } = makeService();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      status: "DRAFT",
      visibility: "PUBLIC",
      closesAt: FUTURE,
    });
    return { service, owner, listing };
  }

  it("eşzamanlı iki publish → tam 1 başarılı, duyuru tek kez, ilan OPEN", async () => {
    const { service, owner, listing } = await draftListing();
    const announceSpy = jest
      .spyOn(
        service as unknown as {
          announceListingOpen: (...a: unknown[]) => Promise<void>;
        },
        "announceListingOpen",
      )
      .mockResolvedValue(undefined);

    const results = await Promise.allSettled([
      service.publishListing(owner.auth, listing.id),
      service.publishListing(owner.auth, listing.id),
    ]);
    const ok = results.filter((r) => r.status === "fulfilled").length;
    expect(ok).toBe(1);
    expect(announceSpy).toHaveBeenCalledTimes(1); // çift duyuru yok

    const after = await prisma.listing.findUniqueOrThrow({
      where: { id: listing.id },
      select: { status: true },
    });
    expect(after.status).toBe("OPEN");
    announceSpy.mockRestore();
  });
});
