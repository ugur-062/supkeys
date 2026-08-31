/**
 * Denetim 2026-08-23 Parça 2 (İhale çekirdeği) — Dalga A regresyonları.
 * Rapor: docs/audit-2026-08-23-part2-listings.md (#1-#3, #5, #7-#12, #14).
 */
import { Prisma } from "@rothern/db";
import { AuditService } from "../../src/modules/audit/audit.service";
import { CompanyBidDocumentsService } from "../../src/modules/company-bid-documents/company-bid-documents.service";
import { CompanyBlocksService } from "../../src/modules/company-blocks/company-blocks.service";
import { CompanyConnectionsService } from "../../src/modules/company-connections/services/company-connections.service";
import type { AuthenticatedCompanyUser } from "../../src/modules/company-auth/strategies/company-jwt.strategy";
import {
  connect,
  makeBid,
  makeCompanyWithUser,
  makeItem,
  makeListing,
} from "./factories";
import { makeService } from "./make-service";
import { prisma, truncateAll } from "./test-db";

const DAY = 86_400_000;
const FUTURE = new Date(Date.now() + 7 * DAY);
const PAST = new Date(Date.now() - 3600_000);

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

function connectionsRig() {
  const audit = new AuditService(prisma as never);
  const blocks = new CompanyBlocksService(prisma as never, audit);
  const email = { send: jest.fn().mockResolvedValue({ emailLogId: "t", sent: true }) };
  const config = { get: jest.fn().mockReturnValue("http://localhost:3000") };
  const notifications = {
    pushToCompany: jest.fn().mockResolvedValue(1),
    pushToUser: jest.fn().mockResolvedValue(1),
  };
  const service = new CompanyConnectionsService(
    prisma as never,
    // P12 #3: bypass client (testte RLS kapalı → aynı client)
    prisma as never,
    blocks,
    email as never,
    config as never,
    notifications as never,
    audit,
  );
  return { service, email, notifications };
}

/** Aynı firmanın ONAYLAYICI-only üyesi (Faz O dar-bağlam). */
function approverOnly(auth: AuthenticatedCompanyUser): AuthenticatedCompanyUser {
  return {
    ...auth,
    userId: `approver-${auth.userId}`,
    roles: ["ONAYLAYICI"],
    isOwner: false,
  } as AuthenticatedCompanyUser;
}

const bnDetails = {
  deliveryDate: new Date(Date.now() + 7 * DAY).toISOString(),
  validityDays: 30,
};

describe("#1 — TOPLU Hemen-Al teklifi kazandırılabilir (S5 nöbetçisi kalemsizde devre dışı)", () => {
  it("SATIS ilan + kalem; buyNow (kalem satırı yok) → award → AWARDED + sipariş", async () => {
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
    });
    await makeItem(prisma, listing.id);
    const bid = (await service.buyNow(buyer.auth, listing.id, bnDetails)) as {
      id: string;
    };
    const bidRow = await prisma.listingBid.findUniqueOrThrow({
      where: { id: bid.id },
      include: { items: true },
    });
    expect(bidRow.items).toHaveLength(0); // TOPLU: kalem satırı yazılmaz
    const res = (await service.award(owner.auth, listing.id, bid.id)) as {
      orderId?: string;
    };
    const l = await prisma.listing.findUniqueOrThrow({
      where: { id: listing.id },
    });
    expect(l.status).toBe("AWARDED");
    const order = await prisma.companyOrder.findFirst({
      where: { listingId: listing.id },
    });
    expect(order).not.toBeNull();
    expect(new Prisma.Decimal(order!.amount).toString()).toBe("5000");
    if (res.orderId) expect(order!.id).toBe(res.orderId);
  });
});

describe("#3 — buyNow INV-KYC-1 + audit", () => {
  it("UNVERIFIED firma Hemen-Al yapamaz (403) ve teklif yazılmaz", async () => {
    const { service } = makeService();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const buyer = await makeCompanyWithUser(prisma, {
      country: "TR",
      companyVerificationStatus: "UNVERIFIED",
    });
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "SATIS",
      status: "OPEN",
      visibility: "PUBLIC",
      buyNowPrice: "5000",
      closesAt: FUTURE,
    });
    await expect(
      service.buyNow(buyer.auth, listing.id, bnDetails),
    ).rejects.toThrow(/Firma doğrulamanız/);
    expect(await prisma.listingBid.count({ where: { listingId: listing.id } })).toBe(0);
  });

  it("doğrulanmış firma: Hemen-Al audit izi bırakır (company.bid.submitted, isBuyNow)", async () => {
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
    });
    await service.buyNow(buyer.auth, listing.id, bnDetails);
    // Audit fire-and-forget olabilir — kısa bekleme ile yokla.
    let row: { metadata: unknown } | null = null;
    for (let i = 0; i < 20 && !row; i++) {
      row = await prisma.auditLog.findFirst({
        where: { action: "company.bid.submitted" },
        select: { metadata: true },
      });
      if (!row) await new Promise((r) => setTimeout(r, 100));
    }
    expect(row).not.toBeNull();
    expect((row!.metadata as { isBuyNow?: boolean }).isBuyNow).toBe(true);
  });
});

describe("#5 — yönetici moderasyonu (CLOSED) sahip aksiyonlarına kapalı", () => {
  async function closedByAdmin() {
    const { service } = makeService();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const bidder = await makeCompanyWithUser(prisma, { country: "TR" });
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      status: "CLOSED",
      format: "RFQ",
      visibility: "PUBLIC",
      closesAt: PAST,
    });
    const bid = await makeBid(prisma, {
      listingId: listing.id,
      bidderCompanyId: bidder.company.id,
      createdById: bidder.user.id,
      amount: 100,
    });
    return { service, owner, bidder, listing, bid };
  }

  it("createNextRound reddedilir (açık mesaj)", async () => {
    const { service, owner, listing } = await closedByAdmin();
    await expect(
      service.createNextRound(owner.auth, listing.id, {
        closesAt: FUTURE.toISOString(),
      } as never),
    ).rejects.toThrow(/yönetici tarafından/);
    const l = await prisma.listing.findUniqueOrThrow({ where: { id: listing.id } });
    expect(l.status).toBe("CLOSED");
  });

  it("award / closeNoAward reddedilir; ilan CLOSED kalır", async () => {
    const { service, owner, listing, bid } = await closedByAdmin();
    await expect(service.award(owner.auth, listing.id, bid.id)).rejects.toThrow();
    await expect(
      service.closeNoAward(owner.auth, listing.id, "gerekçe"),
    ).rejects.toThrow();
    const l = await prisma.listing.findUniqueOrThrow({ where: { id: listing.id } });
    expect(l.status).toBe("CLOSED");
    expect(await prisma.companyOrder.count({ where: { listingId: listing.id } })).toBe(0);
  });
});

describe("#2 — extendBidValidity revive yolu placeBid kapılarını atlayamaz", () => {
  async function openRfq(bidderOpts: Parameters<typeof makeCompanyWithUser>[1] = {}) {
    const { service } = makeService();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const bidder = await makeCompanyWithUser(prisma, { country: "TR", ...bidderOpts });
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      status: "OPEN",
      format: "RFQ",
      visibility: "PUBLIC",
      closesAt: FUTURE,
    });
    return { service, owner, bidder, listing };
  }

  it("taslak düzenlenince submittedAt sıfırlanır → uzatma ile 'canlandırma' yok", async () => {
    const { service, bidder, listing } = await openRfq();
    // Taşınmış taslak görünümü: DRAFT ama eski submittedAt + kısa geçerlilik.
    const draft = await makeBid(prisma, {
      listingId: listing.id,
      bidderCompanyId: bidder.company.id,
      createdById: bidder.user.id,
      amount: 100,
      status: "DRAFT",
      submittedAt: new Date(Date.now() - 30 * DAY),
      validityDays: 10,
    });
    // Teklifçi taslağı düzenler (fiyat değişir) — içerik artık doğrulanmamış.
    await service.placeBid(bidder.auth, listing.id, {
      amount: 1,
      asDraft: true,
      validityDays: 30,
      deliveryDate: FUTURE.toISOString(),
    } as never);
    const after = await prisma.listingBid.findUniqueOrThrow({ where: { id: draft.id } });
    expect(after.status).toBe("DRAFT");
    expect(after.submittedAt).toBeNull();
    // Uzatma revive edemez — gönderim placeBid'den geçmek zorunda.
    await expect(
      service.extendBidValidity(bidder.auth, listing.id, 60),
    ).rejects.toThrow();
    const still = await prisma.listingBid.findUniqueOrThrow({ where: { id: draft.id } });
    expect(still.status).toBe("DRAFT");
  });

  it("revive INV-KYC-1: UNVERIFIED firma taşınmış taslağını uzatarak CANLI yapamaz", async () => {
    const { service, bidder, listing } = await openRfq({
      companyVerificationStatus: "UNVERIFIED",
    });
    const draft = await makeBid(prisma, {
      listingId: listing.id,
      bidderCompanyId: bidder.company.id,
      createdById: bidder.user.id,
      amount: 100,
      status: "DRAFT",
      submittedAt: new Date(Date.now() - 30 * DAY),
      validityDays: 10,
    });
    await expect(
      service.extendBidValidity(bidder.auth, listing.id, 60),
    ).rejects.toThrow(/Firma doğrulamanız/);
    const still = await prisma.listingBid.findUniqueOrThrow({ where: { id: draft.id } });
    expect(still.status).toBe("DRAFT");
  });
});

describe("#8 — Faz O dar-bağlam: roundHistory + teklif belgeleri", () => {
  it("ONAYLAYICI-only üye tur geçmişini ve teklif belgelerini okuyamaz; sahip okur", async () => {
    const { service } = makeService();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      status: "IN_AWARD",
      format: "RFQ",
      visibility: "PUBLIC",
      closesAt: PAST,
    });
    await prisma.listingRoundSnapshot.create({
      data: {
        listingId: listing.id,
        round: 1,
        bidderName: "Gizli Teklifçi A.Ş.",
        amount: new Prisma.Decimal(1234),
      },
    });
    const approver = approverOnly(owner.auth);
    await expect(service.roundHistory(approver, listing.id)).rejects.toThrow();
    const ownerView = (await service.roundHistory(owner.auth, listing.id)) as unknown[];
    expect(Array.isArray(ownerView)).toBe(true);

    const docs = new CompanyBidDocumentsService(
      prisma as never,
      {
        generatePresignedGet: jest.fn().mockResolvedValue("https://r2.test/get"),
      } as never,
    );
    await expect(docs.list(approver, listing.id)).rejects.toThrow();
    await expect(docs.list(owner.auth, listing.id)).resolves.toBeDefined();
  });
});

describe("#7 / #14 — bağlantı servisi: dış davet ilan-yönetim kapısı + opt-out", () => {
  it("ilanı yönetemeyen üye (oluşturan değil) dış ihale daveti gönderemez → 403 + davet yok", async () => {
    const { service, email } = connectionsRig();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      status: "OPEN",
      format: "RFQ",
      visibility: "PRIVATE",
      closesAt: FUTURE,
    });
    // Aynı firmanın connections:manage izinli ama ilanı oluşturmamış üyesi.
    const other = {
      ...owner.auth,
      userId: `u-${owner.user.id}`,
      roles: ["YONETICI", "SATIN_ALMACI"],
      isOwner: false,
    } as AuthenticatedCompanyUser;
    await expect(
      service.inviteExternalForListing(other, listing.id, ["dis@firma.test"]),
    ).rejects.toThrow(/yetki|izin|yönet/i);
    expect(email.send).not.toHaveBeenCalled();
    expect(await prisma.companyReferralInvite.count()).toBe(0);
  });

  it("inviteByEmail: opt-out yapmış adrese davet gönderilmez (409) ve e-posta çıkmaz", async () => {
    const { service, email } = connectionsRig();
    const inviter = await makeCompanyWithUser(prisma, { country: "TR" });
    await prisma.referralOptOut.create({ data: { email: "istemiyor@firma.test" } });
    await expect(
      service.inviteByEmail(inviter.auth, "istemiyor@firma.test"),
    ).rejects.toThrow(/istemediğini|opt|kapat|almak/i);
    expect(email.send).not.toHaveBeenCalled();
  });
});

describe("#9 — getProfile: embargolu ihale profil listesinden sızmaz", () => {
  it("bidsOpenAt gelecekteki PUBLIC ihale görünmez; açık olan görünür; kendi teklifi olan görür", async () => {
    const { service } = connectionsRig();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const viewer = await makeCompanyWithUser(prisma, { country: "TR" });
    await connect(prisma, owner.company.id, viewer.company.id, owner.user.id);
    const open = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      status: "OPEN",
      format: "RFQ",
      visibility: "PUBLIC",
      closesAt: FUTURE,
    });
    const embargoed = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      status: "OPEN",
      format: "RFQ",
      visibility: "PUBLIC",
      bidsOpenAt: new Date(Date.now() + 3 * DAY),
      closesAt: new Date(Date.now() + 10 * DAY),
    });
    const code = "TEST-0001";
    await prisma.company.update({
      where: { id: owner.company.id },
      data: { rothernId: code },
    });
    const profile = (await service.getProfile(viewer.auth, code)) as {
      listings?: { id: string }[];
      openListings?: { id: string }[];
    };
    const ids = (profile.listings ?? profile.openListings ?? []).map((l) => l.id);
    expect(ids).toContain(open.id);
    expect(ids).not.toContain(embargoed.id);

    // Kendi teklifi olan (ör. embargo öncesi davetliyken verilmiş) → görür.
    await makeBid(prisma, {
      listingId: embargoed.id,
      bidderCompanyId: viewer.company.id,
      createdById: viewer.user.id,
      amount: 10,
    });
    const again = (await service.getProfile(viewer.auth, code)) as {
      listings?: { id: string }[];
      openListings?: { id: string }[];
    };
    const ids2 = (again.listings ?? again.openListings ?? []).map((l) => l.id);
    expect(ids2).toContain(embargoed.id);
  });
});

describe("#10 — teklif kur damgası TAZE kurdan (bayat/fallback yok)", () => {
  it("getFreshRate null → damga null (getCurrentRate fallback kullanılmaz)", async () => {
    const { service, exchangeRates } = makeService();
    exchangeRates.getFreshRate.mockResolvedValue(null);
    exchangeRates.getCurrentRate.mockResolvedValue(33);
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const bidder = await makeCompanyWithUser(prisma, { country: "TR" });
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      status: "OPEN",
      format: "RFQ",
      visibility: "PUBLIC",
      closesAt: FUTURE,
      allowedCurrencies: ["TRY", "USD"] as never,
    });
    const res = (await service.placeBid(bidder.auth, listing.id, {
      amount: 100,
      currency: "USD",
      validityDays: 30,
      deliveryDate: FUTURE.toISOString(),
    } as never)) as { id: string };
    const row = await prisma.listingBid.findUniqueOrThrow({ where: { id: res.id } });
    expect(row.exchangeRateSnapshot).toBeNull();
    expect(exchangeRates.getCurrentRate).not.toHaveBeenCalled();
  });
});

describe("#12 — kalem-bazlı kazandırmada kaybedenlere bildirim", () => {
  it("awardByItem: kazanamayan teklifçi LOST + bid_lost bildirimi alır", async () => {
    const { service } = makeService();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const winner = await makeCompanyWithUser(prisma, { country: "TR" });
    const loser = await makeCompanyWithUser(prisma, { country: "TR" });
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      status: "IN_AWARD",
      format: "RFQ",
      visibility: "PUBLIC",
      closesAt: PAST,
    });
    const item = await makeItem(prisma, listing.id);
    const wBid = await makeBid(prisma, {
      listingId: listing.id,
      bidderCompanyId: winner.company.id,
      createdById: winner.user.id,
      amount: 100,
      items: [{ itemId: item.id, unitPrice: 100 }],
    });
    await makeBid(prisma, {
      listingId: listing.id,
      bidderCompanyId: loser.company.id,
      createdById: loser.user.id,
      amount: 120,
      items: [{ itemId: item.id, unitPrice: 120 }],
    });
    await service.awardByItem(owner.auth, listing.id, [
      { itemId: item.id, bidId: wBid.id },
    ]);
    const l = await prisma.listing.findUniqueOrThrow({ where: { id: listing.id } });
    expect(l.status).toBe("AWARDED");
    const loserBid = await prisma.listingBid.findFirstOrThrow({
      where: { listingId: listing.id, bidderCompanyId: loser.company.id },
    });
    expect(loserBid.status).toBe("LOST");
    let n = 0;
    for (let i = 0; i < 30 && n === 0; i++) {
      n = await prisma.notification.count({
        where: { companyId: loser.company.id, type: "bid_lost" },
      });
      if (n === 0) await new Promise((r) => setTimeout(r, 100));
    }
    expect(n).toBeGreaterThan(0);
  });
});

describe("#1b — kesirli miktarda para yuvarlaması (S5 nöbetçisi ile DB uyumu)", () => {
  it("1.5 × 10,33 = 15,495 → bid.amount 15,50 yazılır ve TOPLU kazandırma geçer", async () => {
    const { service } = makeService();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const bidder = await makeCompanyWithUser(prisma, { country: "TR" });
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      status: "OPEN",
      format: "RFQ",
      visibility: "PUBLIC",
      closesAt: FUTURE,
    });
    const item = await makeItem(prisma, listing.id, {
      quantity: new Prisma.Decimal("1.5"),
    });
    const placed = (await service.placeBid(bidder.auth, listing.id, {
      items: [{ itemId: item.id, unitPrice: 10.33 }],
      validityDays: 30,
      deliveryDate: FUTURE.toISOString(),
    } as never)) as { id: string };
    const stored = await prisma.listingBid.findUniqueOrThrow({
      where: { id: placed.id },
    });
    // DB Decimal(18,2) ile birebir — hesap da yuvarlanmış yazılır.
    expect(stored.amount.toString()).toBe("15.5");

    await prisma.listing.update({
      where: { id: listing.id },
      data: { status: "IN_AWARD" },
    });
    // Eskiden nöbetçi 15,495 ≠ 15,50 görüp kazandırmayı kalıcı durduruyordu.
    await service.award(owner.auth, listing.id, placed.id);
    const l = await prisma.listing.findUniqueOrThrow({
      where: { id: listing.id },
    });
    expect(l.status).toBe("AWARDED");
    const order = await prisma.companyOrder.findFirstOrThrow({
      where: { listingId: listing.id },
    });
    expect(order.amount.toString()).toBe("15.5");
  });

  it("kalem-bazlı kazandırma aynı girdide aynı tutarı üretir", async () => {
    const { service } = makeService();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const bidder = await makeCompanyWithUser(prisma, { country: "TR" });
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      status: "IN_AWARD",
      format: "RFQ",
      visibility: "PUBLIC",
      closesAt: PAST,
    });
    const item = await makeItem(prisma, listing.id, {
      quantity: new Prisma.Decimal("1.5"),
    });
    const bid = await makeBid(prisma, {
      listingId: listing.id,
      bidderCompanyId: bidder.company.id,
      createdById: bidder.user.id,
      amount: "15.50",
      items: [{ itemId: item.id, unitPrice: "10.33" }],
    });
    await service.awardByItem(owner.auth, listing.id, [
      { itemId: item.id, bidId: bid.id },
    ]);
    const order = await prisma.companyOrder.findFirstOrThrow({
      where: { listingId: listing.id },
    });
    expect(order.amount.toString()).toBe("15.5");
  });
});
