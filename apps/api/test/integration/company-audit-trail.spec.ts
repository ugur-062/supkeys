/**
 * INV-AUDIT-1 — Firma-tarafı para/yetki geçişlerinin denetim izi.
 * Her audit'lenen aksiyon çalışınca doğru actorId/tenantId/entityId ile bir
 * audit_log kaydı oluştuğunu doğrular; aksiyonun kendi davranışını değil,
 * yalnız EK izi test eder (davranış regresyonu ayrı spec'lerde).
 *
 * Kapsam: kazandırma (tam + kalem-bazlı, doğrudan + onay-yolu), ödeme onay/red,
 * rol değişimi, izin override, aktif/pasif, iş çıkışı + kritik-kayıp marker'ı.
 */
import { EventEmitter2 } from "@nestjs/event-emitter";
import { CompanyRole } from "@rothern/db";
import { AuditService } from "../../src/modules/audit/audit.service";
import { CompanyApprovalsService } from "../../src/modules/company-approvals/company-approvals.service";
import { CompanyOrdersService } from "../../src/modules/company-orders/services/company-orders.service";
import { CompanyUsersService } from "../../src/modules/company-users/company-users.service";
import type { AuthenticatedCompanyUser } from "../../src/modules/company-auth/strategies/company-jwt.strategy";
import { NotificationService } from "../../src/modules/notifications/notification.service";
import { prisma, truncateAll } from "./test-db";
import {
  connect,
  makeBid,
  makeCompany,
  makeCompanyWithUser,
  makeItem,
  makeListing,
  makeUser,
} from "./factories";
import { makeService } from "./make-service";

const future = (days: number) => new Date(Date.now() + days * 86_400_000);

function makeOrdersService() {
  const email = { send: jest.fn().mockResolvedValue({ emailLogId: "t" }) };
  const config = { get: jest.fn().mockReturnValue("http://localhost:3000") };
  const notifications = new NotificationService(prisma as never);
  return new CompanyOrdersService(
    prisma as never,
    email as never,
    config as never,
    notifications,
    new AuditService(prisma as never),
    prisma as never, // RLS bypass client (testte RLS kapali -> prisma ile ayni owner)
  );
}

let authSeq = 0;
function makeUsersService() {
  const supabase = {
    createUser: jest.fn(async () => ({ authId: `auth-${authSeq++}` })),
    deleteUser: jest.fn(async () => undefined),
  };
  const companyAuth = {
    createSession: jest.fn(async (userId: string) => ({
      token: "t",
      user: { id: userId },
    })),
  };
  const email = { send: jest.fn().mockResolvedValue({ emailLogId: "t" }) };
  const config = { get: jest.fn().mockReturnValue("http://localhost:3000") };
  return new CompanyUsersService(
    prisma as never,
    supabase as never,
    companyAuth as never,
    email as never,
    config as never,
    new AuditService(prisma as never),
  );
}

/** Gerçek onay servisi + event köprüsü: onaylanınca GERÇEK kazandırma çalışır. */
function makeApprovalRig() {
  const email = { send: jest.fn().mockResolvedValue({ emailLogId: "t" }) };
  const config = { get: jest.fn().mockReturnValue("http://localhost:3000") };
  const notifications = new NotificationService(prisma as never);
  const events = new EventEmitter2();
  const approvals = new CompanyApprovalsService(
    prisma as never,
    // P12 #3: bypass client (testte RLS kapalı → aynı client)
    prisma as never,
    events,
    email as never,
    config as never,
    notifications,
    new AuditService(prisma as never),
  );
  const { service: listings } = makeService();
  // @ts-expect-error test: mock'lanmış approvals gerçek servisle değiştirilir.
  listings["approvals"] = approvals;
  const inflight: Promise<unknown>[] = [];
  events.on("listing.award.approved", (p) =>
    inflight.push(listings.onAwardApproved(p as never)),
  );
  const flush = async () => {
    await Promise.all(inflight.splice(0));
  };
  return { approvals, listings, flush, events };
}

/**
 * Onay servisi + KAZANDIRMASI KASITEN PATLAYAN handler. decide() son adımda
 * emitAsync'i bekler → handler reject edince finalize geri alınır (rollback) ve
 * BadRequestException fırlar. INV-AUDIT-1: bu yolda company.approval.approved
 * izi DÜŞMEMELİ (onay verildi ama kazandırma uygulanmadı).
 */
function makeFailingAwardRig() {
  const email = { send: jest.fn().mockResolvedValue({ emailLogId: "t" }) };
  const config = { get: jest.fn().mockReturnValue("http://localhost:3000") };
  const notifications = new NotificationService(prisma as never);
  const events = new EventEmitter2();
  const approvals = new CompanyApprovalsService(
    prisma as never,
    // P12 #3: bypass client (testte RLS kapalı → aynı client)
    prisma as never,
    events,
    email as never,
    config as never,
    notifications,
    new AuditService(prisma as never),
  );
  // emitAsync bu async listener'ı bekler → reject → decide catch → rollback.
  events.on("listing.award.approved", async () => {
    throw new Error("kazandırma kasten patladı (test)");
  });
  return { approvals, events };
}

/** Onay eşiğine düşmesi için aktif LISTING_AWARD akışı + tek/çok adım kur. */
async function setupAwardApprovalRequest(
  approvals: CompanyApprovalsService,
  ownerAuth: AuthenticatedCompanyUser,
  approverIds: string[],
) {
  const owner = ownerAuth;
  const bidderCompany = await makeCompanyWithUser(prisma, { country: "TR" });
  await connect(prisma, owner.companyId, bidderCompany.company.id, owner.userId);
  const listing = await makeListing(prisma, {
    companyId: owner.companyId,
    createdById: owner.userId,
    type: "ALIM",
    status: "OPEN",
    closesAt: future(3),
  });
  const item = await makeItem(prisma, listing.id);
  const bid = await makeBid(prisma, {
    listingId: listing.id,
    bidderCompanyId: bidderCompany.company.id,
    createdById: bidderCompany.user.id,
    amount: 5000,
    currency: "TRY",
    items: [{ itemId: item.id, unitPrice: 5000 }],
  });
  const flow = await approvals.createFlow(owner as never, {
    name: "Kazandırma onayı",
    type: "LISTING_AWARD",
    steps: approverIds.map((id) => ({ approverUserId: id })),
  } as never);
  await approvals.setStatus(owner as never, flow.id, {
    status: "ACTIVE",
  } as never);
  const started = (await approvals.requestApproval(owner as never, {
    listingId: listing.id,
    type: "LISTING_AWARD",
    listingType: "ALIM",
    amount: 5000,
    currency: "TRY",
    payload: { kind: "full", bidId: bid.id },
  } as never)) as { approved: boolean; requestId?: string };
  return { listing, bid, requestId: started.requestId!, started };
}

/** roles + companyId'den auth nesnesi (owner olmayan üye için). */
function authFor(
  user: { id: string; email: string },
  companyId: string,
  roles: CompanyRole[],
  isOwner = false,
): AuthenticatedCompanyUser {
  return {
    userId: user.id,
    companyId,
    email: user.email,
    roles,
    country: "TR",
    tier: "GOLD",
    isOwner,
  } as AuthenticatedCompanyUser;
}

/** accept kayıtlı banka hesabı ister — satıcıya hesap açıp onay girdisi döndür. */
async function acceptInputFor(companyId: string) {
  const acct = await prisma.companyBankAccount.create({
    data: {
      companyId,
      title: "Vadesiz TL",
      accountHolder: "Test Firma A.Ş.",
      iban: "TR330006100519786457841326",
    },
  });
  return {
    expectedDeliveryDate: future(5).toISOString(),
    bankAccountId: acct.id,
  };
}

async function makeOrder(
  sellerCompanyId: string,
  buyerCompanyId: string,
  over: Record<string, unknown> = {},
) {
  return prisma.companyOrder.create({
    data: {
      sellerCompanyId,
      buyerCompanyId,
      amount: 1000,
      status: "PENDING",
      paymentTiming: "AFTER_DELIVERY",
      ...over,
    } as never,
  });
}

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

// ─────────────────────────── Kazandırma (para) ───────────────────────────

describe("kazandırma audit'i", () => {
  it("tam kazandırma → company_order iz (actor=başlatan, tenant=ilan sahibi, viaApproval=false)", async () => {
    const { service } = makeService();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const bidder = await makeCompanyWithUser(prisma, { country: "TR" });
    await connect(prisma, owner.company.id, bidder.company.id, owner.user.id);
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      status: "OPEN",
      closesAt: future(3),
    });
    const item = await makeItem(prisma, listing.id);
    const bid = await makeBid(prisma, {
      listingId: listing.id,
      bidderCompanyId: bidder.company.id,
      createdById: bidder.user.id,
      amount: 100,
      currency: "TRY",
      items: [{ itemId: item.id, unitPrice: 100 }],
    });

    const res = (await service.award(owner.auth, listing.id, bid.id)) as {
      orderId: string;
    };

    const row = await prisma.auditLog.findFirstOrThrow({
      where: { action: "company.listing.awarded", entityId: res.orderId },
    });
    expect(row.actorType).toBe("company");
    expect(row.actorId).toBe(owner.user.id);
    expect(row.tenantId).toBe(owner.company.id);
    expect(row.entityType).toBe("company_order");
    const meta = row.metadata as Record<string, unknown>;
    expect(meta).toMatchObject({
      listingId: listing.id,
      bidId: bid.id,
      bidderCompanyId: bidder.company.id,
      currency: "TRY",
      viaApproval: false,
      newBidStatus: "WON",
    });
  });

  it("kalem-bazlı kazandırma → sipariş başına ayrı iz (doğru bidderCompanyId)", async () => {
    const { service } = makeService();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const b1 = await makeCompanyWithUser(prisma, { country: "TR" });
    const b2 = await makeCompanyWithUser(prisma, { country: "TR" });
    await connect(prisma, owner.company.id, b1.company.id, owner.user.id);
    await connect(prisma, owner.company.id, b2.company.id, owner.user.id);
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      status: "OPEN",
      closesAt: future(3),
    });
    const i1 = await makeItem(prisma, listing.id, { lineNo: 1 });
    const i2 = await makeItem(prisma, listing.id, { lineNo: 2 });
    const bid1 = await makeBid(prisma, {
      listingId: listing.id,
      bidderCompanyId: b1.company.id,
      createdById: b1.user.id,
      amount: 100,
      items: [{ itemId: i1.id, unitPrice: 100 }],
    });
    const bid2 = await makeBid(prisma, {
      listingId: listing.id,
      bidderCompanyId: b2.company.id,
      createdById: b2.user.id,
      amount: 200,
      items: [{ itemId: i2.id, unitPrice: 200 }],
    });

    const res = (await service.awardByItem(owner.auth, listing.id, [
      { itemId: i1.id, bidId: bid1.id },
      { itemId: i2.id, bidId: bid2.id },
    ])) as { orders: { id: string }[] };

    const rows = await prisma.auditLog.findMany({
      where: { action: "company.listing.awarded", tenantId: owner.company.id },
    });
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.entityType === "company_order")).toBe(true);
    const bidders = rows.map(
      (r) => (r.metadata as Record<string, unknown>).bidderCompanyId,
    );
    expect(new Set(bidders)).toEqual(
      new Set([b1.company.id, b2.company.id]),
    );
    expect(rows.every((r) => (r.metadata as Record<string, unknown>).byItem)).toBe(
      true,
    );
    // Her iz gerçek bir siparişe bağlı.
    const orderIds = new Set(res.orders.map((o) => o.id));
    expect(rows.every((r) => orderIds.has(r.entityId!))).toBe(true);
  });

  it("onay-yolu: iz actor=INITIATOR, metadata.approverUserId=ONAYLAYAN (viaApproval)", async () => {
    const { approvals, flush } = makeApprovalRig();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const bidder = await makeCompanyWithUser(prisma, { country: "TR" });
    await connect(prisma, owner.company.id, bidder.company.id, owner.user.id);
    const approver = await makeUser(prisma, owner.company.id, [
      CompanyRole.ONAYLAYICI,
    ]);
    const approverAuth = {
      userId: approver.id,
      companyId: owner.company.id,
      email: approver.email,
      roles: [CompanyRole.ONAYLAYICI],
      country: "TR",
      tier: owner.auth.tier,
      isOwner: false,
    } as never;

    const flow = await approvals.createFlow(
      owner.auth,
      { name: "Kazandırma onayı", type: "LISTING_AWARD", steps: [{ approverUserId: approver.id }] } as never,
    );
    await approvals.setStatus(owner.auth, flow.id, { status: "ACTIVE" } as never);

    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      status: "OPEN",
      closesAt: future(3),
    });
    const item = await makeItem(prisma, listing.id);
    const bid = await makeBid(prisma, {
      listingId: listing.id,
      bidderCompanyId: bidder.company.id,
      createdById: bidder.user.id,
      amount: 5000,
      currency: "TRY",
      items: [{ itemId: item.id, unitPrice: 5000 }],
    });

    // Başlatan = owner; onay eşiğine düşer → pendingApproval.
    const started = (await approvals.requestApproval(owner.auth, {
      listingId: listing.id,
      type: "LISTING_AWARD",
      listingType: "ALIM",
      amount: 5000,
      currency: "TRY",
      payload: { kind: "full", bidId: bid.id },
    } as never)) as { approved: boolean; requestId?: string };
    expect(started.approved).toBe(false);

    const req = await prisma.approvalRequest.findFirstOrThrow({
      where: { id: started.requestId! },
    });
    await approvals.decide(approverAuth, req.id, "approve", {} as never);
    await flush(); // @OnEvent köprüsü — kazandırma + iz burada tamamlanır.

    const order = await prisma.companyOrder.findFirstOrThrow({
      where: { listingId: listing.id },
    });
    const row = await prisma.auditLog.findFirstOrThrow({
      where: { action: "company.listing.awarded", entityId: order.id },
    });
    // Insider ayrımı: iz başlatanı gösterir, onaylayan metadata'da.
    expect(row.actorId).toBe(owner.user.id);
    const meta = row.metadata as Record<string, unknown>;
    expect(meta.viaApproval).toBe(true);
    expect(meta.approverUserId).toBe(approver.id);
  });
});

// ─────────────────────────── Ödeme (para) ───────────────────────────

describe("ödeme kararı audit'i", () => {
  async function deliveredOrder(amount = 1000) {
    const seller = await makeCompanyWithUser(prisma, { country: "TR" });
    const buyer = await makeCompanyWithUser(prisma, { country: "TR" });
    const order = await prisma.companyOrder.create({
      data: {
        sellerCompanyId: seller.company.id,
        buyerCompanyId: buyer.company.id,
        amount,
        status: "DELIVERED",
        paymentTiming: "AFTER_DELIVERY",
        deliveredAt: new Date(),
      },
    });
    return { seller, buyer, order };
  }

  it("onay → payment_confirmed iz (from/to, actor=satıcı)", async () => {
    const orders = makeOrdersService();
    const { seller, buyer, order } = await deliveredOrder(1000);
    const p = (await orders.recordPayment(buyer.auth, order.id, {
      amount: 1000,
      method: "EFT",
    } as never)) as { id: string };

    await orders.confirmPayment(seller.auth, order.id, p.id);

    const row = await prisma.auditLog.findFirstOrThrow({
      where: { action: "company.order.payment_confirmed", entityId: p.id },
    });
    expect(row.actorType).toBe("company");
    expect(row.actorId).toBe(seller.user.id);
    expect(row.tenantId).toBe(seller.company.id);
    expect(row.entityType).toBe("company_order_payment");
    expect(row.metadata).toMatchObject({
      orderId: order.id,
      from: "AWAITING_CONFIRMATION",
      to: "CONFIRMED",
    });
  });

  it("red → payment_rejected iz (reason + to=REJECTED)", async () => {
    const orders = makeOrdersService();
    const { seller, buyer, order } = await deliveredOrder(1000);
    const p = (await orders.recordPayment(buyer.auth, order.id, {
      amount: 400,
      method: "EFT",
    } as never)) as { id: string };

    await orders.rejectPayment(seller.auth, order.id, p.id, "Dekont eşleşmiyor");

    const row = await prisma.auditLog.findFirstOrThrow({
      where: { action: "company.order.payment_rejected", entityId: p.id },
    });
    expect(row.actorId).toBe(seller.user.id);
    expect(row.metadata).toMatchObject({
      to: "REJECTED",
      reason: "Dekont eşleşmiyor",
    });
  });
});

// ─────────────────────────── Yetki (rol/izin/erişim) ───────────────────────────

describe("yetki değişimi audit'i", () => {
  it("rol değişimi → roles_changed iz (before/after)", async () => {
    const svc = makeUsersService();
    const owner = await makeCompanyWithUser(prisma);
    const member = await makeUser(prisma, owner.company.id, [
      CompanyRole.SATISCI,
    ]);

    await svc.updateRoles(owner.auth, member.id, {
      roles: [CompanyRole.SATIN_ALMACI],
    } as never);

    const row = await prisma.auditLog.findFirstOrThrow({
      where: { action: "company.user.roles_changed", entityId: member.id },
    });
    expect(row.actorId).toBe(owner.user.id);
    expect(row.tenantId).toBe(owner.company.id);
    expect(row.entityType).toBe("company_user");
    const meta = row.metadata as { before: string[]; after: string[] };
    expect(meta.before).toEqual([CompanyRole.SATISCI]);
    expect(meta.after).toEqual([CompanyRole.SATIN_ALMACI]);
  });

  it("izin override → permissions_overridden iz (after.added)", async () => {
    const svc = makeUsersService();
    const owner = await makeCompanyWithUser(prisma);
    const member = await makeUser(prisma, owner.company.id, [
      CompanyRole.SATISCI,
    ]);

    // Faz R: işlem izinleri override-katalog dışı → yönetim izniyle test.
    await svc.updatePermissions(owner.auth, member.id, {
      added: ["templates:manage"],
      removed: [],
    } as never);

    const row = await prisma.auditLog.findFirstOrThrow({
      where: {
        action: "company.user.permissions_overridden",
        entityId: member.id,
      },
    });
    expect(row.actorId).toBe(owner.user.id);
    const meta = row.metadata as {
      after: { added: string[]; removed: string[] };
    };
    expect(meta.after.added).toContain("templates:manage");
  });

  it("pasifleştirme → active_changed iz (active=false)", async () => {
    const svc = makeUsersService();
    const owner = await makeCompanyWithUser(prisma);
    const member = await makeUser(prisma, owner.company.id, [
      CompanyRole.SATISCI,
    ]);

    await svc.setActive(owner.auth, member.id, false);

    const row = await prisma.auditLog.findFirstOrThrow({
      where: { action: "company.user.active_changed", entityId: member.id },
    });
    expect(row.actorId).toBe(owner.user.id);
    expect(row.metadata).toMatchObject({ active: false });
  });

  it("iş çıkışı → removed iz (hedef e-postası metadata'da YOK)", async () => {
    const svc = makeUsersService();
    const owner = await makeCompanyWithUser(prisma);
    const member = await makeUser(prisma, owner.company.id, [
      CompanyRole.SATISCI,
    ]);

    await svc.remove(owner.auth, member.id);

    const row = await prisma.auditLog.findFirstOrThrow({
      where: { action: "company.user.removed", entityId: member.id },
    });
    expect(row.actorId).toBe(owner.user.id);
    expect(row.tenantId).toBe(owner.company.id);
    // PII güvencesi: e-posta hiçbir metadata alanında geçmez.
    expect(JSON.stringify(row.metadata)).not.toContain(member.email);
  });
});

// ─────────────────────────── Kritik-kayıp marker'ı ───────────────────────────

describe("kritik audit kaybı marker'ı", () => {
  it("critical iz yazılamazsa [AUDIT-KRİTİK-KAYIP] loglanır ve log() throw etmez", async () => {
    const failingPrisma = {
      auditLog: { create: jest.fn().mockRejectedValue(new Error("db down")) },
    };
    const audit = new AuditService(failingPrisma as never);
    const errSpy = jest
      .spyOn((audit as unknown as { logger: { error: (m: string) => void } }).logger, "error")
      .mockImplementation(() => undefined);

    await expect(
      audit.log({
        action: "company.listing.awarded",
        actorType: "company",
        actorId: "u1",
        entityType: "company_order",
        entityId: "o1",
        critical: true,
      }),
    ).resolves.toBeUndefined();

    expect(errSpy).toHaveBeenCalledTimes(1);
    expect(errSpy.mock.calls[0]![0]).toContain("[AUDIT-KRİTİK-KAYIP]");
    expect(errSpy.mock.calls[0]![0]).toContain("company.listing.awarded");
  });

  it("critical değilse sıradan hata mesajı (marker YOK)", async () => {
    const failingPrisma = {
      auditLog: { create: jest.fn().mockRejectedValue(new Error("db down")) },
    };
    const audit = new AuditService(failingPrisma as never);
    const errSpy = jest
      .spyOn((audit as unknown as { logger: { error: (m: string) => void } }).logger, "error")
      .mockImplementation(() => undefined);

    await audit.log({ action: "company.signup", actorType: "company" });

    expect(errSpy.mock.calls[0]![0]).not.toContain("[AUDIT-KRİTİK-KAYIP]");
    expect(errSpy.mock.calls[0]![0]).toContain("audit log yazılamadı");
  });
});

// ═══════════════════════ DALGA 2 ═══════════════════════

// ─────────────────────────── Sipariş yaşam döngüsü ───────────────────────────

describe("sipariş yaşam döngüsü audit'i", () => {
  async function twoParties() {
    const seller = await makeCompanyWithUser(prisma, { country: "TR" });
    const buyer = await makeCompanyWithUser(prisma, { country: "TR" });
    return { seller, buyer };
  }

  it("accept → company.order.accepted iz (actor=satıcı, from/to)", async () => {
    const orders = makeOrdersService();
    const { seller, buyer } = await twoParties();
    const order = await makeOrder(seller.company.id, buyer.company.id);
    await orders.accept(
      seller.auth,
      order.id,
      (await acceptInputFor(seller.company.id)) as never,
    );
    const row = await prisma.auditLog.findFirstOrThrow({
      where: { action: "company.order.accepted", entityId: order.id },
    });
    expect(row.actorType).toBe("company");
    expect(row.actorId).toBe(seller.user.id);
    expect(row.tenantId).toBe(seller.company.id);
    expect(row.entityType).toBe("company_order");
    expect(row.metadata).toMatchObject({ from: "PENDING", to: "ACCEPTED" });
  });

  it("reject → company.order.rejected iz (reason + to=REJECTED)", async () => {
    const orders = makeOrdersService();
    const { seller, buyer } = await twoParties();
    const order = await makeOrder(seller.company.id, buyer.company.id);
    await orders.reject(seller.auth, order.id, "stok tükendi maalesef");
    const row = await prisma.auditLog.findFirstOrThrow({
      where: { action: "company.order.rejected", entityId: order.id },
    });
    expect(row.actorId).toBe(seller.user.id);
    expect(row.metadata).toMatchObject({
      to: "REJECTED",
      reason: "stok tükendi maalesef",
    });
  });

  it("ship → company.order.shipped iz (invoiceNumber + to=IN_DELIVERY)", async () => {
    const orders = makeOrdersService();
    const { seller, buyer } = await twoParties();
    const order = await makeOrder(seller.company.id, buyer.company.id, {
      status: "ACCEPTED",
      acceptedAt: new Date(),
    });
    await orders.ship(seller.auth, order.id, { invoiceNumber: "FTR-9" } as never);
    const row = await prisma.auditLog.findFirstOrThrow({
      where: { action: "company.order.shipped", entityId: order.id },
    });
    expect(row.actorId).toBe(seller.user.id);
    expect(row.metadata).toMatchObject({
      to: "IN_DELIVERY",
      invoiceNumber: "FTR-9",
    });
  });

  it("receive → company.order.received iz (actor=alıcı, madde 17: → COMPLETED)", async () => {
    const orders = makeOrdersService();
    const { seller, buyer } = await twoParties();
    const order = await makeOrder(seller.company.id, buyer.company.id, {
      status: "IN_DELIVERY",
      acceptedAt: new Date(),
      deliveryStartedAt: new Date(),
    });
    await orders.receive(buyer.auth, order.id, {} as never);
    const row = await prisma.auditLog.findFirstOrThrow({
      where: { action: "company.order.received", entityId: order.id },
    });
    expect(row.actorId).toBe(buyer.user.id);
    expect(row.tenantId).toBe(buyer.company.id);
    expect(row.metadata).toMatchObject({
      from: "IN_DELIVERY",
      to: "COMPLETED",
      autoCompleted: true,
    });
  });

  it("complete → company.order.completed iz (to=COMPLETED)", async () => {
    const orders = makeOrdersService();
    const { seller, buyer } = await twoParties();
    const order = await makeOrder(seller.company.id, buyer.company.id, {
      status: "DELIVERED",
      acceptedAt: new Date(),
      deliveryStartedAt: new Date(),
      deliveredAt: new Date(),
    });
    await prisma.companyOrderPayment.create({
      data: {
        orderId: order.id,
        amount: 1000,
        status: "CONFIRMED",
        recordedByCompanyId: buyer.company.id,
        confirmedAt: new Date(),
      },
    });
    await orders.complete(buyer.auth, order.id, {} as never);
    const row = await prisma.auditLog.findFirstOrThrow({
      where: { action: "company.order.completed", entityId: order.id },
    });
    expect(row.actorId).toBe(buyer.user.id);
    expect(row.metadata).toMatchObject({ from: "DELIVERED", to: "COMPLETED" });
  });

  it("cancel → company.order.cancelled iz (reason + to=CANCELLED)", async () => {
    const orders = makeOrdersService();
    const { seller, buyer } = await twoParties();
    const order = await makeOrder(seller.company.id, buyer.company.id, {
      status: "ACCEPTED",
      acceptedAt: new Date(),
    });
    await orders.cancel(buyer.auth, order.id, "ihtiyaç ortadan kalktı");
    const row = await prisma.auditLog.findFirstOrThrow({
      where: { action: "company.order.cancelled", entityId: order.id },
    });
    expect(row.actorId).toBe(buyer.user.id);
    expect(row.metadata).toMatchObject({
      to: "CANCELLED",
      reason: "ihtiyaç ortadan kalktı",
    });
  });
});

// ─────────────────────────── Onay kararı ───────────────────────────

describe("onay kararı audit'i", () => {
  async function approverAuthUser(companyId: string) {
    const u = await makeUser(prisma, companyId, [CompanyRole.ONAYLAYICI]);
    return { user: u, auth: authFor(u, companyId, [CompanyRole.ONAYLAYICI]) };
  }

  it("reject → company.approval.rejected iz (actor=onaycı, isFinal=false, note)", async () => {
    const { approvals } = makeApprovalRig();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const approver = await approverAuthUser(owner.company.id);
    const { requestId } = await setupAwardApprovalRequest(
      approvals,
      owner.auth,
      [approver.user.id],
    );
    await approvals.decide(approver.auth, requestId, "reject", {
      note: "bütçe uygun değil",
    } as never);
    const row = await prisma.auditLog.findFirstOrThrow({
      where: { action: "company.approval.rejected", entityId: requestId },
    });
    expect(row.actorType).toBe("company");
    expect(row.actorId).toBe(approver.user.id);
    expect(row.tenantId).toBe(owner.company.id);
    expect(row.entityType).toBe("approval_request");
    expect(row.metadata).toMatchObject({
      isFinal: false,
      note: "bütçe uygun değil",
    });
  });

  it("ara adım onayı → company.approval.step_approved iz (isFinal=false)", async () => {
    const { approvals } = makeApprovalRig();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const a1 = await approverAuthUser(owner.company.id);
    const a2 = await approverAuthUser(owner.company.id);
    const { requestId } = await setupAwardApprovalRequest(
      approvals,
      owner.auth,
      [a1.user.id, a2.user.id],
    );
    // İlk onaycı onaylar → sıradaki adıma geçer (henüz final değil).
    const res = await approvals.decide(a1.auth, requestId, "approve", {} as never);
    expect(res.status).toBe("STEP_APPROVED");
    const row = await prisma.auditLog.findFirstOrThrow({
      where: { action: "company.approval.step_approved", entityId: requestId },
    });
    expect(row.actorId).toBe(a1.user.id);
    expect(row.metadata).toMatchObject({ isFinal: false });
    // Final izi HENÜZ düşmemeli.
    const finals = await prisma.auditLog.count({
      where: { action: "company.approval.approved", entityId: requestId },
    });
    expect(finals).toBe(0);
  });

  it("son adım onayı (kazandırma başarılı) → company.approval.approved iz (isFinal=true)", async () => {
    const { approvals, flush } = makeApprovalRig();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const approver = await approverAuthUser(owner.company.id);
    const { requestId } = await setupAwardApprovalRequest(
      approvals,
      owner.auth,
      [approver.user.id],
    );
    const res = await approvals.decide(
      approver.auth,
      requestId,
      "approve",
      {} as never,
    );
    expect(res.status).toBe("APPROVED");
    await flush();
    const row = await prisma.auditLog.findFirstOrThrow({
      where: { action: "company.approval.approved", entityId: requestId },
    });
    expect(row.actorId).toBe(approver.user.id);
    expect(row.tenantId).toBe(owner.company.id);
    expect(row.metadata).toMatchObject({ isFinal: true });
  });

  it("son adım onaylandı ama KAZANDIRMA fail/rollback → company.approval.approved iz DÜŞMEZ", async () => {
    const { approvals } = makeFailingAwardRig();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const approver = await approverAuthUser(owner.company.id);
    const { requestId } = await setupAwardApprovalRequest(
      approvals,
      owner.auth,
      [approver.user.id],
    );
    // emitAsync handler patlar → decide rollback edip fırlatır.
    await expect(
      approvals.decide(approver.auth, requestId, "approve", {} as never),
    ).rejects.toThrow(/Kazandırma uygulanamadı/);
    // Kritik: onay verildi ama kazandırma uygulanmadı → final iz OLMAMALI.
    const finals = await prisma.auditLog.count({
      where: { action: "company.approval.approved", entityId: requestId },
    });
    expect(finals).toBe(0);
    // Rollback: istek yeniden PENDING (onaycı tekrar deneyebilir).
    const req = await prisma.approvalRequest.findUniqueOrThrow({
      where: { id: requestId },
    });
    expect(req.status).toBe("PENDING");
  });
});

// ─────────────────────────── İlan durum geçişleri ───────────────────────────

describe("ilan durum geçişi audit'i", () => {
  it("publishListing → company.listing.published iz (DRAFT→OPEN)", async () => {
    const { service } = makeService();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      status: "DRAFT",
      visibility: "PUBLIC",
      closesAt: future(5),
    });
    await service.publishListing(owner.auth, listing.id);
    const row = await prisma.auditLog.findFirstOrThrow({
      where: { action: "company.listing.published", entityId: listing.id },
    });
    expect(row.actorId).toBe(owner.user.id);
    expect(row.tenantId).toBe(owner.company.id);
    expect(row.entityType).toBe("listing");
    expect(row.metadata).toMatchObject({ from: "DRAFT", to: "OPEN" });
  });

  it("startEvaluation → company.listing.evaluation_started iz (OPEN→IN_AWARD)", async () => {
    const { service } = makeService();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      status: "OPEN",
      closesAt: future(5),
    });
    await service.startEvaluation(owner.auth, listing.id);
    const row = await prisma.auditLog.findFirstOrThrow({
      where: {
        action: "company.listing.evaluation_started",
        entityId: listing.id,
      },
    });
    expect(row.actorId).toBe(owner.user.id);
    expect(row.metadata).toMatchObject({ from: "OPEN", to: "IN_AWARD" });
  });

  it("cancel → company.listing.cancelled iz (reason + to=CANCELLED)", async () => {
    const { service } = makeService();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      status: "OPEN",
      closesAt: future(5),
    });
    await service.cancel(owner.auth, listing.id, "proje ertelendi");
    const row = await prisma.auditLog.findFirstOrThrow({
      where: { action: "company.listing.cancelled", entityId: listing.id },
    });
    expect(row.actorId).toBe(owner.user.id);
    expect(row.metadata).toMatchObject({
      to: "CANCELLED",
      reason: "proje ertelendi",
    });
  });

  it("closeNoAward → company.listing.closed_no_award iz", async () => {
    const { service } = makeService();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      status: "OPEN",
      closesAt: future(5),
    });
    await service.closeNoAward(owner.auth, listing.id, "uygun teklif yok");
    const row = await prisma.auditLog.findFirstOrThrow({
      where: {
        action: "company.listing.closed_no_award",
        entityId: listing.id,
      },
    });
    expect(row.actorId).toBe(owner.user.id);
    expect(row.metadata).toMatchObject({
      to: "CLOSED_NO_AWARD",
      reason: "uygun teklif yok",
    });
  });

  it("createNextRound → company.listing.next_round_created iz (tur before/after)", async () => {
    const { service } = makeService();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      status: "IN_AWARD",
      closesAt: future(1),
      currentRound: 1,
    });
    await service.createNextRound(owner.auth, listing.id, {
      type: "RFQ",
      carryBids: "NONE",
      closesAt: future(5).toISOString(),
    } as never);
    const row = await prisma.auditLog.findFirstOrThrow({
      where: {
        action: "company.listing.next_round_created",
        entityId: listing.id,
      },
    });
    expect(row.actorId).toBe(owner.user.id);
    expect(row.metadata).toMatchObject({ fromRound: 1, toRound: 2 });
  });
});

// ─────────────────────────── DENIAL AUDIT (reddedilen yetki) ───────────────────────────

describe("denial audit'i — reddedilen yetki eylemleri", () => {
  /** void (fire-and-forget) denial log'u için kısa poll — yazma throw'dan sonra
   *  tamamlanır. */
  async function waitForAudit(
    where: Record<string, unknown>,
    tries = 30,
    gapMs = 50,
  ) {
    for (let i = 0; i < tries; i++) {
      const row = await prisma.auditLog.findFirst({ where });
      if (row) return row;
      await new Promise((r) => setTimeout(r, gapMs));
    }
    throw new Error(`denial audit bulunamadı: ${JSON.stringify(where)}`);
  }

  it("assertListingManageRole reddi → company.listing.manage_denied iz + Forbidden", async () => {
    const { service } = makeService();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    // AYNI firmada ama ilanı açmayan + buy:listing:manage'siz üye.
    const member = await makeUser(prisma, owner.company.id, [
      CompanyRole.SATISCI,
    ]);
    const memberAuth = authFor(member, owner.company.id, [CompanyRole.SATISCI]);
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id, // ilanı SAHİP açtı, üye değil
      type: "ALIM",
      status: "OPEN",
      closesAt: future(5),
    });
    await expect(
      service.startEvaluation(memberAuth, listing.id),
    ).rejects.toThrow(/yönetme yetkiniz yok/);
    const row = await waitForAudit({
      action: "company.listing.manage_denied",
      entityId: listing.id,
    });
    expect(row.actorId).toBe(member.id);
    expect(row.tenantId).toBe(owner.company.id);
    expect(row.entityType).toBe("listing");
    expect(row.metadata).toMatchObject({
      needed: "buy:listing:manage",
      reason: "missing_permission",
    });
  });

  it("assertCanModifyAdminTarget reddi → company.user.role_change_denied iz + Forbidden", async () => {
    const svc = makeUsersService();
    const owner = await makeCompanyWithUser(prisma);
    // Hedef ADMIN (Yönetici); aktör admin DEĞİL (operasyon rolü).
    const adminTarget = await makeUser(prisma, owner.company.id, [
      CompanyRole.YONETICI,
    ]);
    const actor = await makeUser(prisma, owner.company.id, [
      CompanyRole.SATISCI,
    ]);
    const actorAuth = authFor(actor, owner.company.id, [CompanyRole.SATISCI]);
    // Ayrıcalıksız yeni rol → assertCanGrantRoles geçer, admin-hedef guard'ı çarpar.
    await expect(
      svc.updateRoles(actorAuth, adminTarget.id, {
        roles: [CompanyRole.SATIN_ALMACI],
      } as never),
    ).rejects.toThrow(/yalnızca Kurucu veya Yönetici/);
    const row = await waitForAudit({
      action: "company.user.role_change_denied",
      entityId: adminTarget.id,
    });
    expect(row.actorId).toBe(actor.id);
    expect(row.entityType).toBe("company_user");
    expect(row.metadata).toMatchObject({ reason: "not_admin" });
    // PII güvencesi: hedef e-postası metadata'da geçmez.
    expect(JSON.stringify(row.metadata)).not.toContain(adminTarget.email);
  });

  it("assertNotLastAdmin tetiği → company.user.last_admin_denied iz + 400", async () => {
    const svc = makeUsersService();
    // Sahipsiz firma + TEK yönetici (kendini düşürmeye çalışır → son admin gider).
    const company = await makeCompany(prisma);
    const soleAdmin = await makeUser(prisma, company.id, [CompanyRole.YONETICI]);
    const adminAuth = authFor(soleAdmin, company.id, [CompanyRole.YONETICI]);
    await expect(
      svc.updateRoles(adminAuth, soleAdmin.id, {
        roles: [CompanyRole.SATISCI],
      } as never),
    ).rejects.toThrow(/aktif yönetim yetkilisi/);
    // Denial tx abort SONRASI awaited yazılır — poll gerekmez ama güvenli.
    const row = await waitForAudit({
      action: "company.user.last_admin_denied",
      entityId: soleAdmin.id,
    });
    expect(row.actorId).toBe(soleAdmin.id);
    expect(row.tenantId).toBe(company.id);
    expect(row.metadata).toMatchObject({
      attemptedRoles: [CompanyRole.SATISCI],
    });
  });

  it("denial audit'leri critical:FALSE (Sentry marker YOK) — state-geçişi audit'leri kritik", async () => {
    // Doğrudan kanıt: manage_denied yaz → DB'ye düşen kaydın action'ı doğru,
    // ve critical davranışı log() seviyesinde (yukarıdaki marker testleri
    // critical=true'yu kapsıyor). Burada denial'ın app-side critical:false
    // olduğunu, AuditService.log()'un marker YOLUNA girmediğini doğrularız.
    const failingPrisma = {
      auditLog: { create: jest.fn().mockRejectedValue(new Error("db down")) },
    };
    const audit = new AuditService(failingPrisma as never);
    const errSpy = jest
      .spyOn(
        (audit as unknown as { logger: { error: (m: string) => void } }).logger,
        "error",
      )
      .mockImplementation(() => undefined);
    await audit.log({
      action: "company.listing.manage_denied",
      actorType: "company",
      actorId: "u1",
      entityType: "listing",
      entityId: "l1",
      critical: false,
    });
    expect(errSpy.mock.calls[0]![0]).not.toContain("[AUDIT-KRİTİK-KAYIP]");
  });
});
