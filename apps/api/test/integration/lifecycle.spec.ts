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

  it("award reddedilirse ilan IN_AWARD'a (değerlendirmede) döner", async () => {
    // Red → değerlendirme SÜRÜYOR: kazandırma denemesi yapan alıcı zaten
    // değerlendirme aşamasındaydı; tedarikçideki "değerlendiriliyor" sinyali
    // nötr CLOSED'a düşüp kaybolmasın.
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
    expect(l.status).toBe("IN_AWARD");
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

describe("Değerlendirmeye Al (IN_AWARD)", () => {
  it("startEvaluation: OPEN → IN_AWARD, teklif alımı durur, teklifçiye 'değerlendiriliyor' in-app gider", async () => {
    const { service } = makeService();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const bidder = await makeCompanyWithUser(prisma, { country: "TR" });
    const late = await makeCompanyWithUser(prisma, { country: "TR" });
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      status: "OPEN",
      closesAt: FUTURE,
    });
    const item = await makeItem(prisma, listing.id);
    await makeBid(prisma, {
      listingId: listing.id,
      bidderCompanyId: bidder.company.id,
      createdById: bidder.user.id,
      amount: 1000,
      items: [{ itemId: item.id, unitPrice: 1000 }],
    });
    const res = await service.startEvaluation(owner.auth, listing.id);
    expect(res.status).toBe("IN_AWARD");
    const l = await prisma.listing.findUniqueOrThrow({
      where: { id: listing.id },
    });
    expect(l.status).toBe("IN_AWARD");
    // OPEN'dan alınınca teklif alımı ŞİMDİ durur (closeEarly ile aynı).
    expect(l.closesAt!.getTime()).toBeLessThanOrEqual(Date.now());
    await expect(
      service.placeBid(late.auth, listing.id, {
        amount: 900,
        deliveryDate: FUTURE.toISOString(),
        validityDays: 30,
      } as never),
    ).rejects.toThrow(/teklife kapalı/);
    // Fire-and-forget bildirim — düşene dek bekle.
    let notifs: { title: string }[] = [];
    for (let i = 0; i < 40; i++) {
      notifs = await prisma.notification.findMany({
        where: { companyId: bidder.company.id, type: "listing_evaluation" },
        select: { title: true },
      });
      if (notifs.length > 0) break;
      await new Promise((r) => setTimeout(r, 250));
    }
    expect(notifs.some((n) => n.title.includes("değerlendiriliyor"))).toBe(
      true,
    );
  });

  it("startEvaluation: CLOSED'dan alınır; tekrar/sonuçlanmışta reddedilir; sahibi olmayana 404", async () => {
    const { service } = makeService();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const stranger = await makeCompanyWithUser(prisma, { country: "TR" });
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      status: "CLOSED",
      closesAt: PAST,
    });
    await expect(
      service.startEvaluation(stranger.auth, listing.id),
    ).rejects.toThrow(/bulunamadı/);
    await service.startEvaluation(owner.auth, listing.id);
    const l = await prisma.listing.findUniqueOrThrow({
      where: { id: listing.id },
    });
    expect(l.status).toBe("IN_AWARD");
    // CLOSED'dan alındıysa kapanış zamanına dokunulmaz.
    expect(l.closesAt!.getTime()).toBe(PAST.getTime());
    await expect(
      service.startEvaluation(owner.auth, listing.id),
    ).rejects.toThrow(/zaten değerlendirmede/);
    await prisma.listing.update({
      where: { id: listing.id },
      data: { status: "AWARDED" },
    });
    await expect(
      service.startEvaluation(owner.auth, listing.id),
    ).rejects.toThrow(/açık veya kapanmış/);
  });

  it("stopEvaluation: IN_AWARD → CLOSED (bildirimsiz geri alma); değerlendirmede değilse reddedilir", async () => {
    const { service } = makeService();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      status: "IN_AWARD",
      closesAt: PAST,
    });
    const res = await service.stopEvaluation(owner.auth, listing.id);
    expect(res.status).toBe("CLOSED");
    await expect(
      service.stopEvaluation(owner.auth, listing.id),
    ).rejects.toThrow(/değerlendirmede değil/);
  });

  it("IN_AWARD'dan kazandırma (→ AWARDED + sipariş), kazansız kapatma ve yeni tur çalışır", async () => {
    const { service } = makeService();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const bidder = await makeCompanyWithUser(prisma, { country: "TR" });
    const awardable = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      status: "IN_AWARD",
      closesAt: PAST,
    });
    const item = await makeItem(prisma, awardable.id);
    const b = await makeBid(prisma, {
      listingId: awardable.id,
      bidderCompanyId: bidder.company.id,
      createdById: bidder.user.id,
      amount: 1000,
      items: [{ itemId: item.id, unitPrice: 1000 }],
    });
    await service.award(owner.auth, awardable.id, b.id);
    expect(
      (await prisma.listing.findUniqueOrThrow({ where: { id: awardable.id } }))
        .status,
    ).toBe("AWARDED");
    expect(
      await prisma.companyOrder.count({ where: { listingId: awardable.id } }),
    ).toBe(1);

    const noAward = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      status: "IN_AWARD",
      closesAt: PAST,
    });
    await service.closeNoAward(owner.auth, noAward.id, "uygun teklif yok");
    expect(
      (await prisma.listing.findUniqueOrThrow({ where: { id: noAward.id } }))
        .status,
    ).toBe("CLOSED_NO_AWARD");

    const rounds = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      status: "IN_AWARD",
      closesAt: PAST,
      currentRound: 1,
    });
    await service.createNextRound(owner.auth, rounds.id, {
      type: "RFQ",
      carryBids: "NONE",
      closesAt: FUTURE.toISOString(),
    } as never);
    expect(
      (await prisma.listing.findUniqueOrThrow({ where: { id: rounds.id } }))
        .currentRound,
    ).toBe(2);
  });

  it("scheduler — evaluationValidityReminders: dolmak üzere teklifte SAHİBE tek seferlik hatırlatma", async () => {
    const { service } = makeService();
    const scheduler = new ListingScheduler(prisma as never, service as never);
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const bidder = await makeCompanyWithUser(prisma, { country: "TR" });
    // Geçerliliği 3 gün içinde dolacak teklif (29 gün önce gönderilmiş, 30g).
    const expiring = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      status: "IN_AWARD",
      closesAt: PAST,
    });
    await makeBid(prisma, {
      listingId: expiring.id,
      bidderCompanyId: bidder.company.id,
      createdById: bidder.user.id,
      amount: 1000,
      submittedAt: new Date(Date.now() - 29 * 24 * 3600 * 1000),
      validityDays: 30,
    });
    // Geçerliliği çok ileride olan teklif → hatırlatma YOK.
    const healthy = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      status: "IN_AWARD",
      closesAt: PAST,
    });
    await makeBid(prisma, {
      listingId: healthy.id,
      bidderCompanyId: bidder.company.id,
      createdById: bidder.user.id,
      amount: 1000,
      validityDays: 365,
    });
    await scheduler.evaluationValidityReminders();
    expect(
      (await prisma.listing.findUniqueOrThrow({ where: { id: expiring.id } }))
        .evaluationReminderSentAt,
    ).not.toBeNull();
    expect(
      (await prisma.listing.findUniqueOrThrow({ where: { id: healthy.id } }))
        .evaluationReminderSentAt,
    ).toBeNull();
    let notifs: { body: string }[] = [];
    for (let i = 0; i < 40; i++) {
      notifs = await prisma.notification.findMany({
        where: {
          companyId: owner.company.id,
          type: "listing_evaluation_reminder",
        },
        select: { body: true },
      });
      if (notifs.length > 0) break;
      await new Promise((r) => setTimeout(r, 250));
    }
    expect(notifs).toHaveLength(1);
    expect(notifs[0].body).toMatch(/geçerlilik/);
    // İdempotent: ikinci koşu (damga durduğundan) yeni hatırlatma üretmez.
    await scheduler.evaluationValidityReminders();
    await new Promise((r) => setTimeout(r, 1000));
    expect(
      await prisma.notification.count({
        where: {
          companyId: owner.company.id,
          type: "listing_evaluation_reminder",
        },
      }),
    ).toBe(1);
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
