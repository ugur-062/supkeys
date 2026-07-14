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
import { NotificationService } from "../../src/modules/notifications/notification.service";
import { prisma, truncateAll } from "./test-db";
import {
  connect,
  makeBid,
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
    events,
    email as never,
    config as never,
    notifications,
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

  it("onay → payment_confirmed iz (from/to + autoCompleted, actor=satıcı)", async () => {
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
      autoCompleted: true,
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
      autoCompleted: false,
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

    await svc.updatePermissions(owner.auth, member.id, {
      added: ["buy:listing:create"],
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
    expect(meta.after.added).toContain("buy:listing:create");
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
