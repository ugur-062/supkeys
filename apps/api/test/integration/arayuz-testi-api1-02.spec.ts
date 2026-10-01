/**
 * Arayüz testi api1-02 — teklif tarafı kuralları, sipariş/değerlendirme yetki
 * sırası ve bildirim içerikleri.
 *
 *  - O-038: satış listesinde `canBid` rol iznini de içerir (paket kapısının
 *    İÇİNDE rol kapısı) — görüntüleyici kartta "Teklif ver" görmez.
 *  - O-071: taslak canlandırma (`extendBidValidity`) placeBid'in erişim
 *    kapılarından geçer — bağlantısı düşen ücretsiz üye ve engellenen
 *    tedarikçi canlandıramaz.
 *  - O-072: canlandırmada KYC kuralı placeBid ile aynı — bağlantılı
 *    doğrulanmamış tedarikçi muaf.
 *  - D-161: sevk ve değerlendirmede taraf/rol kontrolü iş ön koşulundan önce.
 *  - D-163: ücretli ama doğrulanmamış / incelemedeki firmaya kategori
 *    duyurusu "hemen teklif verin" demez.
 *  - D-106: "teklifiniz kazandı" bildirimi talebin başlığını ve numarasını taşır.
 */
import { CompanyRole } from "@rothern/db";
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { AuditService } from "../../src/modules/audit/audit.service";
import { CompanyOrdersService } from "../../src/modules/company-orders/services/company-orders.service";
import { CompanyReviewsService } from "../../src/modules/company-reviews/company-reviews.service";
import { NotificationService } from "../../src/modules/notifications/notification.service";
import type { AuthenticatedCompanyUser } from "../../src/modules/company-auth/strategies/company-jwt.strategy";
import { connect, makeBid, makeCompanyWithUser, makeItem, makeListing } from "./factories";
import { makeService } from "./make-service";
import { prisma, truncateAll } from "./test-db";

const DAY = 86_400_000;
const FUTURE = new Date(Date.now() + 7 * DAY);
const SEG = "10000000";
const CLASS = "10101500";

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

function withRoles(auth: AuthenticatedCompanyUser, roles: CompanyRole[]): AuthenticatedCompanyUser {
  return { ...auth, roles, isOwner: false } as AuthenticatedCompanyUser;
}

describe("O-038 — satış listesinde canBid rolü de içerir", () => {
  it("teklif izni olmayan görüntüleyicide canBid=false, Satışçıda true", async () => {
    const { service } = makeService();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const seller = await makeCompanyWithUser(prisma, { country: "TR", tier: "SILVER" });
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      status: "OPEN",
      visibility: "PUBLIC",
      closesAt: FUTURE,
    });
    const asSeller = await service.sellerTenders(seller.auth, "ALIM");
    const sellerRow = (asSeller as { id: string; canBid: boolean }[]).find((r) => r.id === listing.id);
    expect(sellerRow?.canBid).toBe(true);

    // Görüntüleyici: rol etiketi var ama teklif izni yok.
    const viewer = withRoles(seller.auth, [CompanyRole.YONETICI]);
    const asViewer = await service.sellerTenders(viewer, "ALIM");
    const viewerRow = (asViewer as { id: string; canBid: boolean }[]).find((r) => r.id === listing.id);
    expect(viewerRow).toBeDefined();
    expect(viewerRow!.canBid).toBe(false);
  });
});

describe("O-071 / O-072 — taslak canlandırma placeBid kapılarıyla aynı", () => {
  async function carriedDraft(
    bidderOpts: Parameters<typeof makeCompanyWithUser>[1],
    opts: { connected?: boolean } = {},
  ) {
    const ctx = makeService();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const bidder = await makeCompanyWithUser(prisma, { country: "TR", ...bidderOpts });
    if (opts.connected) {
      await connect(prisma, owner.company.id, bidder.company.id, owner.user.id);
    }
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      status: "OPEN",
      format: "RFQ",
      visibility: "PUBLIC",
      closesAt: FUTURE,
    });
    // Taşımada süresi dolup taslağa düşmüş teklif (fiyat korunur).
    const draft = await makeBid(prisma, {
      listingId: listing.id,
      bidderCompanyId: bidder.company.id,
      createdById: bidder.user.id,
      amount: 100,
      status: "DRAFT",
      submittedAt: new Date(Date.now() - 30 * DAY),
      validityDays: 10,
    });
    return { ...ctx, owner, bidder, listing, draft };
  }

  it("O-071: bağlantısı kalmamış STANDART firma taslağını canlandıramaz (403, DRAFT kalır)", async () => {
    const { service, bidder, listing, draft } = await carriedDraft({ tier: "STANDART" });
    await expect(service.extendBidValidity(bidder.auth, listing.id, 60)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    const still = await prisma.listingBid.findUniqueOrThrow({ where: { id: draft.id } });
    expect(still.status).toBe("DRAFT");
    expect(still.validityDays).toBe(10);
  });

  it("O-071: alıcının engellediği tedarikçi taslağını canlandıramaz (404)", async () => {
    const { service, blocks, bidder, listing, draft } = await carriedDraft({ tier: "GOLD" });
    blocks.blockedCompanyIds.mockResolvedValue([bidder.company.id]);
    await expect(service.extendBidValidity(bidder.auth, listing.id, 60)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    const still = await prisma.listingBid.findUniqueOrThrow({ where: { id: draft.id } });
    expect(still.status).toBe("DRAFT");
  });

  it("O-072: bağlantılı ama doğrulanmamış STANDART tedarikçi canlandırabilir (KYC muaf)", async () => {
    const { service, bidder, listing, draft } = await carriedDraft(
      { tier: "STANDART", companyVerificationStatus: "UNVERIFIED" },
      { connected: true },
    );
    const res = await service.extendBidValidity(bidder.auth, listing.id, 60);
    expect(res).toMatchObject({ revived: true });
    const after = await prisma.listingBid.findUniqueOrThrow({ where: { id: draft.id } });
    expect(after.status).toBe("SUBMITTED");
    expect(after.validityDays).toBe(70);
  });

  it("O-072: davetsiz/bağlantısız doğrulanmamış ücretli firma yine KYC'ye takılır", async () => {
    const { service, bidder, listing } = await carriedDraft({
      tier: "SILVER",
      companyVerificationStatus: "UNVERIFIED",
    });
    await expect(service.extendBidValidity(bidder.auth, listing.id, 60)).rejects.toThrow(
      /Firma doğrulamanız/,
    );
  });
});

describe("D-161 — taraf/rol kontrolü iş ön koşulundan önce", () => {
  function ordersRig() {
    return new CompanyOrdersService(
      prisma as never,
      { send: jest.fn().mockResolvedValue({ emailLogId: "t", sent: true }) } as never,
      { get: jest.fn().mockReturnValue("http://localhost:3000") } as never,
      new NotificationService(prisma as never),
      new AuditService(prisma as never),
      prisma as never,
    );
  }

  it("alıcı peşin siparişte ship çağırırsa 403 alır, peşin tutarı sızmaz", async () => {
    const orders = ordersRig();
    const seller = await makeCompanyWithUser(prisma, { country: "TR" });
    const buyer = await makeCompanyWithUser(prisma, { country: "TR" });
    const order = await prisma.companyOrder.create({
      data: {
        sellerCompanyId: seller.company.id,
        buyerCompanyId: buyer.company.id,
        amount: 1000,
        status: "ACCEPTED",
        paymentTiming: "BEFORE_DELIVERY",
        paymentCategory: "ADVANCE",
        advancePercent: 100,
        acceptedAt: new Date(),
      },
    });
    await expect(
      orders.ship(buyer.auth, order.id, { invoiceNumber: "FTR-1" } as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
    // Satıcı yine iş kuralına takılır (peşin eşiği) — davranış korunur.
    await expect(
      orders.ship(seller.auth, order.id, { invoiceNumber: "FTR-1" } as never),
    ).rejects.toThrow(/peşin/i);
  });

  it("satıcı receive çağırırsa 403 (vesaik ön koşulu değil)", async () => {
    const orders = ordersRig();
    const seller = await makeCompanyWithUser(prisma, { country: "TR" });
    const buyer = await makeCompanyWithUser(prisma, { country: "TR" });
    const order = await prisma.companyOrder.create({
      data: {
        sellerCompanyId: seller.company.id,
        buyerCompanyId: buyer.company.id,
        amount: 1000,
        status: "IN_DELIVERY",
        paymentTiming: "BEFORE_DELIVERY",
        paymentCategory: "CASH_AGAINST_DOCS",
      },
    });
    await expect(
      orders.receive(seller.auth, order.id, {} as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("değerlendirme: rolsüz üye tamamlanmamış siparişte 400 değil 403 alır", async () => {
    const svc = new CompanyReviewsService(prisma as never);
    const seller = await makeCompanyWithUser(prisma, { country: "TR" });
    const buyer = await makeCompanyWithUser(prisma, { country: "TR" });
    const order = await prisma.companyOrder.create({
      data: {
        sellerCompanyId: seller.company.id,
        buyerCompanyId: buyer.company.id,
        amount: 1000,
        status: "ACCEPTED",
      },
    });
    await expect(
      svc.upsert(withRoles(buyer.auth, [CompanyRole.SAHIP]), { orderId: order.id, rating: 5 }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    // Yetkili üye iş kuralını görür.
    await expect(svc.upsert(buyer.auth, { orderId: order.id, rating: 5 })).rejects.toThrow(
      /tamamlanmış/i,
    );
  });
});

describe("D-163 — ücretli ama doğrulanmamış firmaya kategori duyurusu", () => {
  async function announceTo(status: "UNVERIFIED" | "PENDING") {
    const { service, email } = makeService();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const seller = await makeCompanyWithUser(prisma, {
      country: "TR",
      tier: "SILVER",
      companyVerificationStatus: status,
    });
    await prisma.company.update({
      where: { id: seller.company.id },
      data: { sellerCategoryIds: [SEG], billingEmail: "ucretli@firma.com" },
    });
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      visibility: "PUBLIC",
      categoryIds: [CLASS],
    });
    await service.notifyCategoryMatchedCompanies(listing.id);
    const inApp = await prisma.notification.findMany({
      where: { companyId: seller.company.id, type: "listing_category_match" },
    });
    return { email, listing, inApp };
  }

  it("doğrulanmamış SILVER: doğrulama çağrısı, 'hemen teklif verin' yok", async () => {
    const { email, inApp } = await announceTo("UNVERIFIED");
    expect(email.send).toHaveBeenCalledTimes(1);
    const payload = JSON.stringify((email.send as jest.Mock).mock.calls[0][0].templateData);
    expect(payload).toContain("/company/ayarlar/dogrulama");
    expect(payload).toContain("Ücretsiz Doğrulan");
    expect(payload).not.toContain("hemen teklif verin");
    expect(inApp.length).toBeGreaterThan(0);
    expect(inApp[0]!.body).toMatch(/doğrulayın/);
  });

  it("incelemedeki SILVER: 'onaylandığında teklif verebilirsiniz', talep bağlantısı", async () => {
    const { email, listing, inApp } = await announceTo("PENDING");
    const payload = JSON.stringify((email.send as jest.Mock).mock.calls[0][0].templateData);
    expect(payload).toContain("incelemede");
    expect(payload).not.toContain("hemen teklif verin");
    expect(payload).toContain(`/company/ilan/${listing.id}`);
    expect(inApp[0]!.body).toMatch(/onaylanınca/);
  });
});

describe("D-106 — kazandı bildirimi talebi adıyla anar", () => {
  it("in-app 'teklifiniz kazandı' gövdesi talep başlığı ve numarasını içerir", async () => {
    const { service } = makeService();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const seller = await makeCompanyWithUser(prisma, { country: "TR" });
    await connect(prisma, owner.company.id, seller.company.id, owner.user.id);
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      status: "OPEN",
      format: "RFQ",
      visibility: "CONNECTIONS",
      title: "Paslanmaz vida alımı",
      closesAt: FUTURE,
    });
    const item = await makeItem(prisma, listing.id);
    await service.placeBid(seller.auth, listing.id, {
      items: [{ itemId: item.id, unitPrice: 10 }],
      deliveryDate: FUTURE.toISOString(),
      validityDays: 30,
    } as never);
    const bid = await prisma.listingBid.findFirstOrThrow({ where: { listingId: listing.id } });
    await service.award(owner.auth, listing.id, bid.id);
    const won = await prisma.notification.findFirstOrThrow({
      where: { companyId: seller.company.id, type: "bid_awarded" },
    });
    expect(won.body).toContain("Paslanmaz vida alımı");
    const l = await prisma.listing.findUniqueOrThrow({ where: { id: listing.id }, select: { number: true } });
    if (l.number) expect(won.body).toContain(l.number);
    expect(won.ctaUrl).toMatch(/\/company\/siparis\//);
  });
});
