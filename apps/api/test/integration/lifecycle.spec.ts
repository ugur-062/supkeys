/**
 * Yaşam döngüsü & onay akışı: publish/award onay dalları, SATIS kazandırma
 * yönü, withdraw, erken kapatma, kazansız kapatma, yeni tur, scheduler.
 */
import { prisma, truncateAll } from "./test-db";
import { ListingScheduler } from "../../src/modules/company-listings/schedulers/listing.scheduler";
import {
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

describe("onay akışı (approval) dalları", () => {
  it("award onay gerekiyorsa IN_AWARD_APPROVAL'a alınır, sipariş oluşmaz", async () => {
    const { service, approvals } = makeService();
    approvals.requestApproval.mockResolvedValue({ approved: false });
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const bidder = await makeCompanyWithUser(prisma, { country: "TR" });
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      status: "OPEN",
      closesAt: FUTURE,
    });
    const item = await makeItem(prisma, listing.id);
    const b = await makeBid(prisma, {
      listingId: listing.id,
      bidderCompanyId: bidder.company.id,
      createdById: bidder.user.id,
      amount: 1000,
      items: [{ itemId: item.id, unitPrice: 1000 }],
    });
    const res = (await service.award(owner.auth, listing.id, b.id)) as {
      pendingApproval?: boolean;
    };
    expect(res.pendingApproval).toBe(true);
    const l = await prisma.listing.findUniqueOrThrow({
      where: { id: listing.id },
    });
    expect(l.status).toBe("IN_AWARD_APPROVAL");
    expect(
      await prisma.companyOrder.count({ where: { listingId: listing.id } }),
    ).toBe(0);

    // onaylanınca sipariş oluşur
    await service.onAwardApproved({
      listingId: listing.id,
      payload: { kind: "full", bidId: b.id },
    });
    const l2 = await prisma.listing.findUniqueOrThrow({
      where: { id: listing.id },
    });
    expect(l2.status).toBe("AWARDED");
    expect(
      await prisma.companyOrder.count({ where: { listingId: listing.id } }),
    ).toBe(1);
  });

  it("award reddedilirse ilan CLOSED'a döner", async () => {
    const { service } = makeService();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      status: "IN_AWARD_APPROVAL",
      closesAt: FUTURE,
    });
    await service.onAwardRejected({ listingId: listing.id });
    const l = await prisma.listing.findUniqueOrThrow({
      where: { id: listing.id },
    });
    expect(l.status).toBe("CLOSED");
  });

  it("publish onayı KALDIRILDI (877c7cc) → DRAFT doğrudan OPEN olur, onay istenmez", async () => {
    // LISTING_PUBLISH onay akışı 877c7cc'de bilinçli kaldırıldı: onay artık
    // YALNIZ kazandırmada (award). Yayın hiçbir koşulda IN_APPROVAL'a girmez.
    const { service, approvals } = makeService();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      status: "DRAFT",
      // cc5387b: yayın artık gelecekte kapanış tarihi şart koşar.
      closesAt: FUTURE,
    });
    await makeItem(prisma, listing.id);
    await service.publishListing(owner.auth, listing.id);
    const l = await prisma.listing.findUniqueOrThrow({
      where: { id: listing.id },
    });
    expect(l.status).toBe("OPEN");
    // Kapı geri gelmesin: yayın onay servisini ÇAĞIRMAMALI.
    expect(approvals.requestApproval).not.toHaveBeenCalled();
  });
});

describe("SATIS kazandırma yönü", () => {
  it("SATIS: sipariş satıcı=sahip, alıcı=teklifçi (ALIM'in tersi)", async () => {
    const { service } = makeService();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const buyer = await makeCompanyWithUser(prisma, { country: "TR" });
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "SATIS",
      status: "OPEN",
      closesAt: FUTURE,
    });
    const item = await makeItem(prisma, listing.id);
    const b = await makeBid(prisma, {
      listingId: listing.id,
      bidderCompanyId: buyer.company.id,
      createdById: buyer.user.id,
      amount: 2000,
      items: [{ itemId: item.id, unitPrice: 2000 }],
    });
    await service.award(owner.auth, listing.id, b.id);
    const order = await prisma.companyOrder.findFirstOrThrow({
      where: { listingId: listing.id },
    });
    expect(order.sellerCompanyId).toBe(owner.company.id);
    expect(order.buyerCompanyId).toBe(buyer.company.id);
  });
});

describe("durum geçişleri", () => {
  it("gönderilmiş teklif geri çekilemez/düzenlenemez; eleme (LOST) sonrası yeniden teklif serbest", async () => {
    const { service } = makeService();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const bidder = await makeCompanyWithUser(prisma, { country: "TR" });
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      status: "OPEN",
      closesAt: FUTURE,
    });
    const bidBase = { deliveryDate: FUTURE.toISOString(), validityDays: 30 };
    await service.placeBid(bidder.auth, listing.id, {
      amount: 1000,
      ...bidBase,
    } as never);
    // SUBMITTED teklif düzenlenemez (geri çekme de yok — endpoint kaldırıldı).
    await expect(
      service.placeBid(bidder.auth, listing.id, {
        amount: 900,
        ...bidBase,
      } as never),
    ).rejects.toThrow(/düzenlenemez/);
    // Alıcı eler → LOST.
    await prisma.listingBid.updateMany({
      where: { listingId: listing.id, bidderCompanyId: bidder.company.id },
      data: { status: "LOST" },
    });
    // Eleme sonrası yeniden teklif serbest → SUBMITTED.
    await service.placeBid(bidder.auth, listing.id, {
      amount: 900,
      ...bidBase,
    } as never);
    const after = await prisma.listingBid.findFirstOrThrow({
      where: { listingId: listing.id, bidderCompanyId: bidder.company.id },
    });
    expect(after.status).toBe("SUBMITTED");
  });

  it("closeBiddingEarly: OPEN → CLOSED", async () => {
    const { service } = makeService();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      status: "OPEN",
      closesAt: FUTURE,
    });
    await service.closeBiddingEarly(owner.auth, listing.id);
    const l = await prisma.listing.findUniqueOrThrow({
      where: { id: listing.id },
    });
    expect(l.status).toBe("CLOSED");
  });

  it("closeNoAward: → CLOSED_NO_AWARD (+ gerekçe)", async () => {
    const { service } = makeService();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      status: "CLOSED",
      closesAt: PAST,
    });
    await service.closeNoAward(owner.auth, listing.id, "uygun teklif yok");
    const l = await prisma.listing.findUniqueOrThrow({
      where: { id: listing.id },
    });
    expect(l.status).toBe("CLOSED_NO_AWARD");
    expect(l.cancelReason).toBe("uygun teklif yok");
  });

  it("createNextRound: tur numarası artar", async () => {
    const { service } = makeService();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      status: "CLOSED",
      closesAt: PAST,
      currentRound: 1,
    });
    await service.createNextRound(owner.auth, listing.id, {
      type: "RFQ",
      carryBids: "NONE",
      closesAt: FUTURE.toISOString(),
    } as never);
    const l = await prisma.listing.findUniqueOrThrow({
      where: { id: listing.id },
    });
    expect(l.currentRound).toBe(2);
  });
});

describe("scheduler — closeExpired", () => {
  it("süresi geçmiş AÇIK ilanı CLOSED yapar, dolmamışa dokunmaz", async () => {
    const { service } = makeService();
    const scheduler = new ListingScheduler(prisma as never, service as never);
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const expired = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      status: "OPEN",
      closesAt: PAST,
    });
    const live = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      status: "OPEN",
      closesAt: FUTURE,
    });
    await scheduler.closeExpired();
    expect(
      (await prisma.listing.findUniqueOrThrow({ where: { id: expired.id } }))
        .status,
    ).toBe("CLOSED");
    expect(
      (await prisma.listing.findUniqueOrThrow({ where: { id: live.id } }))
        .status,
    ).toBe("OPEN");
  });
});
