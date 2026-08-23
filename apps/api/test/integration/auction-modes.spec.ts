/**
 * (4) Açık eksiltme görünürlük modları (computeAuctionView), tur taşıma
 * (carryBids AUTO/LAZY/NONE + eliminateNonBidders), kapanış hatırlatma scheduler.
 */
import { prisma, truncateAll } from "./test-db";
import { ListingScheduler } from "../../src/modules/company-listings/schedulers/listing.scheduler";
import {
  invite,
  makeBid,
  makeCompanyWithUser,
  makeItem,
  makeListing,
} from "./factories";
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

async function auctionWithBids(bidVisibility: string) {
  const { service } = makeService();
  const owner = await makeCompanyWithUser(prisma, { country: "TR" });
  const viewer = await makeCompanyWithUser(prisma, {
    country: "TR",
    tier: "GOLD",
  });
  const rival = await makeCompanyWithUser(prisma, { country: "TR" });
  const listing = await makeListing(prisma, {
    companyId: owner.company.id,
    createdById: owner.user.id,
    type: "ALIM",
    status: "OPEN",
    visibility: "PUBLIC",
    format: "ENGLISH_AUCTION",
    bidVisibility,
    closesAt: FUTURE,
  });
  await makeBid(prisma, {
    listingId: listing.id,
    bidderCompanyId: rival.company.id,
    createdById: rival.user.id,
    amount: 800,
  });
  await makeBid(prisma, {
    listingId: listing.id,
    bidderCompanyId: viewer.company.id,
    createdById: viewer.user.id,
    amount: 1000,
  });
  return { service, owner, viewer, listing };
}

describe("açık eksiltme görünürlük modları (kimlik sızdırmaz)", () => {
  it("BEST_PRICE: en iyi tutar görünür, sıra/liste gizli", async () => {
    const { service, viewer, listing } = await auctionWithBids("BEST_PRICE");
    const res = (await service.getOne(viewer.auth, listing.id)) as {
      auctionView: {
        bestTotal: string | null;
        myRank: number | null;
        allBids: unknown;
      };
    };
    expect(res.auctionView.bestTotal).toBe("800");
    expect(res.auctionView.myRank).toBeNull();
    expect(res.auctionView.allBids).toBeNull();
    expect("bids" in res).toBe(false); // rakip isimleri yok
  });

  it("OWN_RANK: kendi sıram görünür, en iyi tutar gizli", async () => {
    const { service, viewer, listing } = await auctionWithBids("OWN_RANK");
    const res = (await service.getOne(viewer.auth, listing.id)) as {
      auctionView: { bestTotal: string | null; myRank: number | null };
    };
    expect(res.auctionView.myRank).toBe(2); // 1000 → 2. sıra (800 önde)
    expect(res.auctionView.bestTotal).toBeNull();
  });

  it("ALL: tüm sıralar tutar+isMine ile (firma kimliği YOK)", async () => {
    const { service, viewer, listing } = await auctionWithBids("ALL");
    const res = (await service.getOne(viewer.auth, listing.id)) as {
      auctionView: {
        allBids: { rank: number; total: string; isMine: boolean }[];
      };
    };
    expect(res.auctionView.allBids).toHaveLength(2);
    const mine = res.auctionView.allBids.find((b) => b.isMine);
    expect(mine!.total).toBe("1000");
    // kimlik alanı sızmamalı
    for (const b of res.auctionView.allBids) {
      expect(b).not.toHaveProperty("bidderName");
      expect(b).not.toHaveProperty("bidderCompanyId");
    }
  });
});

describe("createNextRound — teklif taşıma modları", () => {
  async function roundSetup(carryBids: "AUTO" | "LAZY" | "NONE") {
    const { service } = makeService();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const bidder = await makeCompanyWithUser(prisma, { country: "TR" });
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      status: "IN_AWARD",
      closesAt: PAST,
      currentRound: 1,
    });
    const b = await makeBid(prisma, {
      listingId: listing.id,
      bidderCompanyId: bidder.company.id,
      createdById: bidder.user.id,
      amount: 1000,
    });
    await service.createNextRound(owner.auth, listing.id, {
      type: "RFQ",
      carryBids,
      closesAt: FUTURE.toISOString(),
    } as never);
    return { listing, b };
  }

  it("AUTO: önceki teklif SUBMITTED kalır + tur arşivlenir", async () => {
    const { listing, b } = await roundSetup("AUTO");
    expect(
      (await prisma.listingBid.findUniqueOrThrow({ where: { id: b.id } }))
        .status,
    ).toBe("SUBMITTED");
    expect(
      (await prisma.listing.findUniqueOrThrow({ where: { id: listing.id } }))
        .currentRound,
    ).toBe(2);
    expect(
      await prisma.listingRoundSnapshot.count({
        where: { listingId: listing.id },
      }),
    ).toBe(1);
  });

  it("LAZY: önceki teklif DRAFT'a çekilir", async () => {
    const { b } = await roundSetup("LAZY");
    expect(
      (await prisma.listingBid.findUniqueOrThrow({ where: { id: b.id } }))
        .status,
    ).toBe("DRAFT");
  });

  it("NONE: önceki teklif LOST olur", async () => {
    const { b } = await roundSetup("NONE");
    expect(
      (await prisma.listingBid.findUniqueOrThrow({ where: { id: b.id } }))
        .status,
    ).toBe("LOST");
  });

  it("eliminateNonBidders: teklif vermeyenin daveti silinir", async () => {
    const { service } = makeService();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const bidder = await makeCompanyWithUser(prisma, { country: "TR" });
    const idle = await makeCompanyWithUser(prisma, { country: "TR" });
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      status: "IN_AWARD",
      closesAt: PAST,
      currentRound: 1,
    });
    await invite(prisma, listing.id, bidder.company.id, owner.user.id);
    await invite(prisma, listing.id, idle.company.id, owner.user.id);
    await makeBid(prisma, {
      listingId: listing.id,
      bidderCompanyId: bidder.company.id,
      createdById: bidder.user.id,
      amount: 1000,
    });
    await service.createNextRound(owner.auth, listing.id, {
      type: "RFQ",
      carryBids: "NONE",
      eliminateNonBidders: true,
      closesAt: FUTURE.toISOString(),
    } as never);
    const remaining = await prisma.listingInvitation.findMany({
      where: { listingId: listing.id },
    });
    expect(remaining).toHaveLength(1);
    expect(remaining[0].invitedCompanyId).toBe(bidder.company.id);
  });
});

describe("kapanış hatırlatması — teklif vermemişlere", () => {
  it("reminder yalnızca teklif VERMEMİŞ davetlilere e-posta atar", async () => {
    const { service, email } = makeService();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const bidder = await makeCompanyWithUser(prisma, { country: "TR" });
    const idle = await makeCompanyWithUser(prisma, { country: "TR" });
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      status: "OPEN",
      closesAt: FUTURE,
    });
    const item = await makeItem(prisma, listing.id);
    await invite(prisma, listing.id, bidder.company.id, owner.user.id);
    await invite(prisma, listing.id, idle.company.id, owner.user.id);
    await makeBid(prisma, {
      listingId: listing.id,
      bidderCompanyId: bidder.company.id,
      createdById: bidder.user.id,
      amount: 100,
      items: [{ itemId: item.id, unitPrice: 100 }],
    });

    await service.notifyListingInvitees(listing.id, "reminder");
    // idle (teklif vermemiş) alır; bidder almaz → tek e-posta.
    expect(email.send).toHaveBeenCalledTimes(1);
  });
});

describe("scheduler — sendClosingReminders", () => {
  it("pencere içindeki ilanı damgalar, dışındakine dokunmaz, idempotent", async () => {
    const { service } = makeService();
    const scheduler = new ListingScheduler(prisma as never, service as never);
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });

    // 30 dk sonra kapanıyor, 60 dk kala hatırlat → pencere açık (due)
    const due = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      status: "OPEN",
      closesAt: new Date(Date.now() + 30 * 60_000),
      sendClosingReminder: true,
      reminderMinutesBefore: 60,
    });
    // 1 gün sonra kapanıyor, 60 dk kala → henüz değil (not due)
    const notDue = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      status: "OPEN",
      closesAt: new Date(Date.now() + 24 * 3600_000),
      sendClosingReminder: true,
      reminderMinutesBefore: 60,
    });

    await scheduler.sendClosingReminders();
    expect(
      (await prisma.listing.findUniqueOrThrow({ where: { id: due.id } }))
        .closingReminderSentAt,
    ).not.toBeNull();
    expect(
      (await prisma.listing.findUniqueOrThrow({ where: { id: notDue.id } }))
        .closingReminderSentAt,
    ).toBeNull();

    // idempotent: ikinci çalıştırma damgayı değiştirmez
    const firstStamp = (
      await prisma.listing.findUniqueOrThrow({ where: { id: due.id } })
    ).closingReminderSentAt!;
    await scheduler.sendClosingReminders();
    expect(
      (await prisma.listing.findUniqueOrThrow({ where: { id: due.id } }))
        .closingReminderSentAt!.getTime(),
    ).toBe(firstStamp.getTime());
  });
});
