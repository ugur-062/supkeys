/**
 * Faz AI-4 — asistan aksiyon çerçevesi sözleşmesi:
 *  - propose: doğrulanmış özet + oturuma pendingAction; sahiplik dışı/eksik
 *    girdi → ok:false problem (kart çıkmaz).
 *  - confirm: TEK kullanımlık (ikinci confirm reddedilir), süre dolunca
 *    reddedilir, yürütme MEVCUT servis kapılarından geçer (kullanıcı kimliği).
 *  - publish_tender: eksik zorunlulu taslak ÖNERİLEMEZ; tam taslak onayla
 *    gerçek ilana dönüşür ve oturum taslağı temizlenir.
 */
import { Prisma } from "@rothern/db";
import { AssistantActionsService } from "../../src/modules/ai/assistant/assistant-actions.service";
import type { PrismaService } from "../../src/common/prisma/prisma.service";
import { AuditService } from "../../src/modules/audit/audit.service";
import { CompanyOrdersService } from "../../src/modules/company-orders/services/company-orders.service";
import { NotificationService } from "../../src/modules/notifications/notification.service";
import { prisma, truncateAll } from "./test-db";
import { makeBid, makeCompanyWithUser, makeItem, makeListing } from "./factories";
import { makeService } from "./make-service";

const auditStub = { log: jest.fn().mockResolvedValue(undefined) };

let codeSeq = 0;
/** Firma kısa kodu ata (factory üretmez) — SHORT_CODE formatında. */
async function giveCode(companyId: string): Promise<string> {
  const code = `TEST-${String(1000 + codeSeq++).slice(-4)}`;
  await prisma.company.update({ where: { id: companyId }, data: { rothernId: code } });
  return code;
}

function makeOrdersService() {
  const email = { send: jest.fn().mockResolvedValue({ emailLogId: "test", sent: true }) };
  const config = { get: jest.fn().mockReturnValue("http://localhost:3000") };
  return new CompanyOrdersService(
    prisma as never,
    email as never,
    config as never,
    new NotificationService(prisma as never),
    new AuditService(prisma as never),
    prisma as never,
  );
}

function makeActions() {
  const { service: listings } = makeService();
  return new AssistantActionsService(
    prisma as unknown as PrismaService,
    listings,
    makeOrdersService(),
    auditStub as unknown as AuditService,
  );
}

async function makeSession(userId: string, companyId: string, draft?: object) {
  return prisma.aiChatSession.create({
    data: {
      userId,
      companyId,
      title: "test",
      ...(draft ? { tenderDraft: draft as Prisma.InputJsonValue } : {}),
    },
  });
}

/** Zorunluları tam bir konuşma taslağı (sanitizer'dan geçecek şekilde). */
function fullDraft(overrides: Record<string, unknown> = {}) {
  return {
    title: "500 adet baret alımı",
    description: "Şantiye için",
    primaryCurrency: "TRY",
    deliveryTerm: "DOMESTIC_DELIVERED",
    paymentCategory: "OPEN_ACCOUNT",
    bidsCloseAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    keywords: ["baret"],
    items: [{ name: "Baret", quantity: 500, unit: "adet" }],
    suggestedCategoryIds: ["30991900"],
    ...overrides,
  };
}

/** Aktif bağlantılı + kodlu davetli firma kurar (publish/invite akışları için). */
async function makeConnectedInvitee(ownerCompanyId: string, ownerUserId: string, name = "Davetli AŞ") {
  const invitee = await makeCompanyWithUser(prisma, { name });
  const code = await giveCode(invitee.company.id);
  await prisma.companyConnection.create({
    data: {
      inviterCompanyId: ownerCompanyId,
      inviteeCompanyId: invitee.company.id,
      invitedById: ownerUserId,
      status: "ACTIVE",
      origin: "PREMIUM",
    },
  });
  return { invitee, code };
}

async function seedCategory(code = "30991900") {
  await prisma.category.create({
    data: {
      id: code,
      code,
      nameTr: "Kişisel koruyucu donanım (KKD)",
      level: 3,
      isActive: true,
      sortOrder: 0,
    },
  });
}

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  jest.clearAllMocks();
  await truncateAll();
});

describe("proposeSendInvites", () => {
  it("sahip olunmayan ihale için ok:false döner (kart çıkmaz)", async () => {
    const actions = makeActions();
    const owner = await makeCompanyWithUser(prisma);
    const other = await makeCompanyWithUser(prisma);
    const listing = await makeListing(prisma, {
      companyId: other.company.id,
      createdById: other.user.id,
      type: "ALIM",
    });
    const session = await makeSession(owner.user.id, owner.company.id);

    const otherCode = await giveCode(other.company.id);
    const out = await actions.proposeSendInvites(owner.auth, session.id, {
      listingId: listing.id,
      rothernIds: [otherCode],
    });
    expect(out.ok).toBe(false);
    const s = await prisma.aiChatSession.findUnique({ where: { id: session.id } });
    expect(s?.pendingAction).toBeNull();
  });

  it("geçerli öneri: pendingAction yazılır, özet firma adını içerir", async () => {
    const actions = makeActions();
    const owner = await makeCompanyWithUser(prisma);
    const invitee = await makeCompanyWithUser(prisma, { name: "Davetli AŞ" });
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
    });
    const session = await makeSession(owner.user.id, owner.company.id);

    const inviteeCode = await giveCode(invitee.company.id);
    const out = await actions.proposeSendInvites(owner.auth, session.id, {
      listingId: listing.id,
      rothernIds: [inviteeCode],
    });
    expect(out.ok).toBe(true);
    expect(out.pending!.severity).toBe("normal");
    expect(out.pending!.summary.join(" ")).toContain("Davetli AŞ");
  });

  it("confirm: bağlantılı firmaya davet oluşur; İKİNCİ confirm reddedilir", async () => {
    const actions = makeActions();
    const owner = await makeCompanyWithUser(prisma);
    const invitee = await makeCompanyWithUser(prisma);
    await prisma.companyConnection.create({
      data: {
        inviterCompanyId: owner.company.id,
        inviteeCompanyId: invitee.company.id,
        invitedById: owner.user.id,
        status: "ACTIVE",
        origin: "PREMIUM",
      },
    });
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
    });
    const session = await makeSession(owner.user.id, owner.company.id);
    const inviteeCode = await giveCode(invitee.company.id);
    const out = await actions.proposeSendInvites(owner.auth, session.id, {
      listingId: listing.id,
      rothernIds: [inviteeCode],
    });
    expect(out.ok).toBe(true);

    const res = await actions.confirm(owner.auth, session.id, out.pending!.id);
    expect(res.status).toBe("executed");
    const inv = await prisma.listingInvitation.findFirst({
      where: { listingId: listing.id, invitedCompanyId: invitee.company.id },
    });
    expect(inv).not.toBeNull();
    expect(auditStub.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: "ai.action_executed" }),
    );

    // Tek kullanım: aynı onay tekrar yürütülemez.
    await expect(
      actions.confirm(owner.auth, session.id, out.pending!.id),
    ).rejects.toThrow();
  });

  it("süresi dolmuş onay reddedilir", async () => {
    const actions = makeActions();
    const owner = await makeCompanyWithUser(prisma);
    const invitee = await makeCompanyWithUser(prisma);
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
    });
    const session = await makeSession(owner.user.id, owner.company.id);
    const inviteeCode = await giveCode(invitee.company.id);
    const out = await actions.proposeSendInvites(owner.auth, session.id, {
      listingId: listing.id,
      rothernIds: [inviteeCode],
    });
    // Süreyi geçmişe çek (kayıt üstünde).
    const s = await prisma.aiChatSession.findUnique({ where: { id: session.id } });
    const action = s!.pendingAction as Record<string, unknown>;
    await prisma.aiChatSession.update({
      where: { id: session.id },
      data: {
        pendingAction: {
          ...action,
          expiresAt: new Date(Date.now() - 1000).toISOString(),
        } as Prisma.InputJsonValue,
      },
    });
    await expect(
      actions.confirm(owner.auth, session.id, out.pending!.id),
    ).rejects.toThrow(/süresi doldu/i);
  });

  it("başka kullanıcının oturumundaki onayı confirm EDEMEZ", async () => {
    const actions = makeActions();
    const owner = await makeCompanyWithUser(prisma);
    const attacker = await makeCompanyWithUser(prisma);
    const invitee = await makeCompanyWithUser(prisma);
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
    });
    const session = await makeSession(owner.user.id, owner.company.id);
    const inviteeCode = await giveCode(invitee.company.id);
    const out = await actions.proposeSendInvites(owner.auth, session.id, {
      listingId: listing.id,
      rothernIds: [inviteeCode],
    });
    await expect(
      actions.confirm(attacker.auth, session.id, out.pending!.id),
    ).rejects.toThrow();
  });
});

describe("proposePublishTender", () => {
  it("davetli firma verilmeden yayın önerilemez", async () => {
    const actions = makeActions();
    const owner = await makeCompanyWithUser(prisma);
    const session = await makeSession(owner.user.id, owner.company.id, fullDraft());
    const out = await actions.proposePublishTender(owner.auth, session.id, {
      type: "ALIM",
      rothernIds: [],
    });
    expect(out.ok).toBe(false);
    expect(out.problem).toMatch(/davet/i);
  });

  it("eksik zorunlulu taslak önerilemez (ok:false + eksik listesi)", async () => {
    const actions = makeActions();
    const owner = await makeCompanyWithUser(prisma);
    const { code } = await makeConnectedInvitee(owner.company.id, owner.user.id);
    const session = await makeSession(
      owner.user.id,
      owner.company.id,
      fullDraft({ bidsCloseAt: null, deliveryTerm: null }),
    );
    const out = await actions.proposePublishTender(owner.auth, session.id, {
      type: "ALIM",
      rothernIds: [code],
    });
    expect(out.ok).toBe(false);
    expect(out.problem).toMatch(/eksik/i);
  });

  it("teslimat adresi olmayan firma için ok:false (adres yönlendirmesi)", async () => {
    const actions = makeActions();
    await seedCategory();
    const owner = await makeCompanyWithUser(prisma);
    const { code } = await makeConnectedInvitee(owner.company.id, owner.user.id);
    const session = await makeSession(owner.user.id, owner.company.id, fullDraft());
    const out = await actions.proposePublishTender(owner.auth, session.id, {
      type: "ALIM",
      rothernIds: [code],
    });
    expect(out.ok).toBe(false);
    expect(out.problem).toMatch(/adres/i);
  });

  it("tam taslak: kritik onay kartı; confirm → ilan OPEN + taslak temizlenir", async () => {
    const actions = makeActions();
    await seedCategory();
    const owner = await makeCompanyWithUser(prisma);
    await prisma.companyAddress.create({
      data: {
        companyId: owner.company.id,
        type: "TESLIMAT",
        title: "Depo",
        addressLine: "Test Mah. 1",
        city: "İstanbul",
      },
    });
    const { invitee, code } = await makeConnectedInvitee(owner.company.id, owner.user.id);
    const session = await makeSession(owner.user.id, owner.company.id, fullDraft());

    const out = await actions.proposePublishTender(owner.auth, session.id, {
      type: "ALIM",
      rothernIds: [code],
    });
    expect(out.ok).toBe(true);
    expect(out.pending!.severity).toBe("critical");
    expect(out.pending!.summary.join(" ")).toContain("500 adet baret alımı");
    expect(out.pending!.summary.join(" ")).toContain("Davetli AŞ");

    const res = await actions.confirm(owner.auth, session.id, out.pending!.id);
    expect(res.status).toBe("executed");
    const listing = await prisma.listing.findFirst({
      where: { companyId: owner.company.id, title: "500 adet baret alımı" },
    });
    expect(listing?.status).toBe("OPEN");
    expect(listing?.categoryIds).toEqual(["30991900"]);
    const invRows = await prisma.listingInvitation.count({
      where: { listingId: listing!.id, invitedCompanyId: invitee.company.id },
    });
    expect(invRows).toBe(1);
    const s = await prisma.aiChatSession.findUnique({ where: { id: session.id } });
    expect(s?.tenderDraft).toBeNull();
    expect(s?.pendingAction).toBeNull();
  });

  it("reject: hiçbir şey yürütülmez, pendingAction temizlenir", async () => {
    const actions = makeActions();
    await seedCategory();
    const owner = await makeCompanyWithUser(prisma);
    await prisma.companyAddress.create({
      data: {
        companyId: owner.company.id,
        type: "TESLIMAT",
        title: "Depo",
        addressLine: "Test Mah. 1",
        city: "İstanbul",
      },
    });
    const { code } = await makeConnectedInvitee(owner.company.id, owner.user.id);
    const session = await makeSession(owner.user.id, owner.company.id, fullDraft());
    const out = await actions.proposePublishTender(owner.auth, session.id, {
      type: "ALIM",
      rothernIds: [code],
    });
    const res = await actions.reject(owner.auth, session.id, out.pending!.id);
    expect(res.status).toBe("rejected");
    expect(
      await prisma.listing.count({ where: { companyId: owner.company.id } }),
    ).toBe(0);
  });
});

describe("Faz 2 — eleme + toplu kazandırma", () => {
  async function bidSetup() {
    const actions = makeActions();
    const owner = await makeCompanyWithUser(prisma);
    const bidder = await makeCompanyWithUser(prisma, { name: "Teklifçi AŞ" });
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      status: "OPEN",
      format: "RFQ",
      title: "Baret alımı",
    });
    const item = await makeItem(prisma, listing.id, {
      quantity: new Prisma.Decimal(2),
    });
    const bid = await makeBid(prisma, {
      listingId: listing.id,
      bidderCompanyId: bidder.company.id,
      createdById: bidder.user.id,
      amount: "200",
      currency: "TRY",
      items: [{ itemId: item.id, unitPrice: "100" }],
    });
    const session = await makeSession(owner.user.id, owner.company.id);
    return { actions, owner, bidder, listing, bid, session };
  }

  it("eleme: özet tedarikçi adını taşır; confirm → bid LOST", async () => {
    const { actions, owner, listing, bid, session } = await bidSetup();
    const out = await actions.proposeEliminateBid(owner.auth, session.id, {
      listingId: listing.id,
      bidId: bid.id,
      reason: "fiyat yüksek",
    });
    expect(out.ok).toBe(true);
    expect(out.pending!.severity).toBe("normal");
    expect(out.pending!.summary.join(" ")).toContain("Teklifçi AŞ");

    const res = await actions.confirm(owner.auth, session.id, out.pending!.id);
    expect(res.status).toBe("executed");
    const updated = await prisma.listingBid.findUnique({ where: { id: bid.id } });
    expect(updated?.status).toBe("LOST");
  });

  it("eleme: başka firmanın ihalesi için ok:false", async () => {
    const { actions, listing, bid } = await bidSetup();
    const outsider = await makeCompanyWithUser(prisma);
    const session2 = await makeSession(outsider.user.id, outsider.company.id);
    const out = await actions.proposeEliminateBid(outsider.auth, session2.id, {
      listingId: listing.id,
      bidId: bid.id,
    });
    expect(out.ok).toBe(false);
  });

  it("kazandırma: kritik kart (GERİ ALINAMAZ uyarılı); confirm → AWARDED + sipariş", async () => {
    const { actions, owner, listing, bid, session } = await bidSetup();
    const out = await actions.proposeAwardTender(owner.auth, session.id, {
      listingId: listing.id,
      bidId: bid.id,
    });
    expect(out.ok).toBe(true);
    expect(out.pending!.severity).toBe("critical");
    expect(out.pending!.summary.join(" ")).toMatch(/GERİ ALINAMAZ/);

    const res = await actions.confirm(owner.auth, session.id, out.pending!.id);
    expect(res.status).toBe("executed");
    const l = await prisma.listing.findUnique({ where: { id: listing.id } });
    expect(l?.status).toBe("AWARDED");
    expect(await prisma.companyOrder.count()).toBe(1);
  });

  it("kazandırma: elenmiş (LOST) teklif önerilemez", async () => {
    const { actions, owner, listing, bid, session } = await bidSetup();
    await prisma.listingBid.update({ where: { id: bid.id }, data: { status: "LOST" } });
    const out = await actions.proposeAwardTender(owner.auth, session.id, {
      listingId: listing.id,
      bidId: bid.id,
    });
    expect(out.ok).toBe(false);
  });
});

describe("Faz 3 — teklif verme + teslim alma", () => {
  it("place_bid: tüm kalemler fiyatlı → kritik kart (toplam doğru); confirm → SUBMITTED bid", async () => {
    const actions = makeActions();
    const owner = await makeCompanyWithUser(prisma);
    const bidder = await makeCompanyWithUser(prisma);
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      status: "OPEN",
      format: "RFQ",
      visibility: "PUBLIC",
      title: "Kablo alımı",
      primaryCurrency: "TRY",
      allowedCurrencies: ["TRY"],
    });
    const item = await makeItem(prisma, listing.id, {
      quantity: new Prisma.Decimal(10),
      name: "NYM kablo",
    });
    const session = await makeSession(bidder.user.id, bidder.company.id);

    const out = await actions.proposePlaceBid(bidder.auth, session.id, {
      listingId: listing.id,
      items: [{ itemId: item.id, unitPrice: 50 }],
      deliveryTime: "W1_2",
      validityDays: 30,
    });
    expect(out.ok).toBe(true);
    expect(out.pending!.severity).toBe("critical");
    expect(out.pending!.summary.join(" ")).toContain("TOPLAM: 500 TRY");
    expect(out.pending!.summary.join(" ")).toMatch(/GERİ ÇEKİLEMEZ/);

    const res = await actions.confirm(bidder.auth, session.id, out.pending!.id);
    expect(res.status).toBe("executed");
    const bid = await prisma.listingBid.findFirst({
      where: { listingId: listing.id, bidderCompanyId: bidder.company.id },
    });
    expect(bid?.status).toBe("SUBMITTED");
    expect(bid?.amount.toString()).toBe("500");
  });

  it("place_bid: eksik kalem fiyatı → ok:false, kalem adı söylenir", async () => {
    const actions = makeActions();
    const owner = await makeCompanyWithUser(prisma);
    const bidder = await makeCompanyWithUser(prisma);
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      status: "OPEN",
      format: "RFQ",
      visibility: "PUBLIC",
    });
    await makeItem(prisma, listing.id, { name: "Fiyatsız kalem" });
    const session = await makeSession(bidder.user.id, bidder.company.id);
    const out = await actions.proposePlaceBid(bidder.auth, session.id, {
      listingId: listing.id,
      items: [],
    });
    expect(out.ok).toBe(false);
    expect(out.problem).toContain("Fiyatsız kalem");
  });

  it("place_bid: belge zorunlu ihale sayfaya yönlendirilir", async () => {
    const actions = makeActions();
    const owner = await makeCompanyWithUser(prisma);
    const bidder = await makeCompanyWithUser(prisma);
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      status: "OPEN",
      format: "RFQ",
      visibility: "PUBLIC",
      requireBidDocument: true,
    });
    await makeItem(prisma, listing.id, {});
    const session = await makeSession(bidder.user.id, bidder.company.id);
    const out = await actions.proposePlaceBid(bidder.auth, session.id, {
      listingId: listing.id,
      items: [],
    });
    expect(out.ok).toBe(false);
    expect(out.problem).toMatch(/belge/i);
  });

  it("mark_order_received: IN_DELIVERY sipariş → kart; confirm → oto-COMPLETED (madde 17)", async () => {
    const actions = makeActions();
    const seller = await makeCompanyWithUser(prisma, { name: "Satıcı AŞ" });
    const buyer = await makeCompanyWithUser(prisma);
    const order = await prisma.companyOrder.create({
      data: {
        sellerCompanyId: seller.company.id,
        buyerCompanyId: buyer.company.id,
        amount: 1000,
        status: "IN_DELIVERY",
        paymentTiming: "AFTER_DELIVERY",
      } as never,
    });
    const session = await makeSession(buyer.user.id, buyer.company.id);
    const out = await actions.proposeMarkOrderReceived(buyer.auth, session.id, {
      orderId: order.id,
    });
    expect(out.ok).toBe(true);
    expect(out.pending!.summary.join(" ")).toContain("Satıcı AŞ");

    const res = await actions.confirm(buyer.auth, session.id, out.pending!.id);
    expect(res.status).toBe("executed");
    const updated = await prisma.companyOrder.findUnique({ where: { id: order.id } });
    expect(updated?.status).toBe("COMPLETED");
  });

  it("mark_order_received: satıcı taraf öneremez (alıcı-scope)", async () => {
    const actions = makeActions();
    const seller = await makeCompanyWithUser(prisma);
    const buyer = await makeCompanyWithUser(prisma);
    const order = await prisma.companyOrder.create({
      data: {
        sellerCompanyId: seller.company.id,
        buyerCompanyId: buyer.company.id,
        amount: 1000,
        status: "IN_DELIVERY",
        paymentTiming: "AFTER_DELIVERY",
      } as never,
    });
    const session = await makeSession(seller.user.id, seller.company.id);
    const out = await actions.proposeMarkOrderReceived(seller.auth, session.id, {
      orderId: order.id,
    });
    expect(out.ok).toBe(false);
  });
});
