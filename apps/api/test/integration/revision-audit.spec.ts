/**
 * INV-AUDIT-1 (dalga 3) — Sipariş revizyonu denetim izi.
 * Öner/onayla/reddet/geri-çek her biri audit_logs'a bir kayıt düşürür.
 * Onay para geçişidir (tutar değişir) → amountBefore/After izlenir. Aksiyonların
 * kendi davranışı order-workflow spec'inde — burada yalnız EK iz.
 */
import { CompanyOrdersService } from "../../src/modules/company-orders/services/company-orders.service";
import { AuditService } from "../../src/modules/audit/audit.service";
import { NotificationService } from "../../src/modules/notifications/notification.service";
import { makeCompanyWithUser } from "./factories";
import { prisma, truncateAll } from "./test-db";

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

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

/** İki taraf + ACCEPTED sipariş (revizyona uygun: ödeme yok, LC yok). */
async function acceptedOrder(amount = 1000) {
  const seller = await makeCompanyWithUser(prisma, { country: "TR" });
  const buyer = await makeCompanyWithUser(prisma, { country: "TR" });
  const order = await prisma.companyOrder.create({
    data: {
      sellerCompanyId: seller.company.id,
      buyerCompanyId: buyer.company.id,
      amount,
      currency: "TRY",
      status: "ACCEPTED",
      acceptedAt: new Date(),
      paymentTiming: "AFTER_DELIVERY",
    } as never,
  });
  return { seller, buyer, order };
}

const revItems = (unitPrice: number, quantity = 2) => ({
  items: [{ name: "Revize kalem", quantity, unit: "adet", unitPrice }],
});

describe("sipariş revizyonu audit'i", () => {
  it("öner → company.order.revision_proposed iz (actor=satıcı, order_revision)", async () => {
    const orders = makeOrdersService();
    const { seller, order } = await acceptedOrder();

    const res = (await orders.proposeRevision(
      seller.auth,
      order.id,
      revItems(600) as never,
    )) as { revisionId: string };

    const row = await prisma.auditLog.findFirstOrThrow({
      where: {
        action: "company.order.revision_proposed",
        entityId: res.revisionId,
      },
    });
    expect(row.actorType).toBe("company");
    expect(row.actorId).toBe(seller.user.id);
    expect(row.tenantId).toBe(seller.company.id);
    expect(row.entityType).toBe("order_revision");
    expect(row.metadata).toMatchObject({
      orderId: order.id,
      amount: 1200,
      currency: "TRY",
    });
  });

  it("onayla → company.order.revision_approved iz (actor=alıcı, amountBefore/After)", async () => {
    const orders = makeOrdersService();
    const { seller, buyer, order } = await acceptedOrder(1000);
    const proposed = (await orders.proposeRevision(
      seller.auth,
      order.id,
      revItems(600) as never,
    )) as { revisionId: string };

    await orders.approveRevision(buyer.auth, order.id, proposed.revisionId);

    const row = await prisma.auditLog.findFirstOrThrow({
      where: {
        action: "company.order.revision_approved",
        entityId: proposed.revisionId,
      },
    });
    expect(row.actorId).toBe(buyer.user.id);
    expect(row.tenantId).toBe(buyer.company.id);
    expect(row.metadata).toMatchObject({
      orderId: order.id,
      amountBefore: 1000,
      amountAfter: 1200,
      currency: "TRY",
    });
  });

  it("reddet → company.order.revision_rejected iz (reason)", async () => {
    const orders = makeOrdersService();
    const { seller, buyer, order } = await acceptedOrder();
    const proposed = (await orders.proposeRevision(
      seller.auth,
      order.id,
      revItems(600) as never,
    )) as { revisionId: string };

    await orders.rejectRevision(
      buyer.auth,
      order.id,
      proposed.revisionId,
      "fiyat artışı kabul edilemez",
    );

    const row = await prisma.auditLog.findFirstOrThrow({
      where: {
        action: "company.order.revision_rejected",
        entityId: proposed.revisionId,
      },
    });
    expect(row.actorId).toBe(buyer.user.id);
    expect(row.metadata).toMatchObject({
      orderId: order.id,
      reason: "fiyat artışı kabul edilemez",
    });
  });

  it("geri çek → company.order.revision_cancelled iz (actor=satıcı)", async () => {
    const orders = makeOrdersService();
    const { seller, order } = await acceptedOrder();
    const proposed = (await orders.proposeRevision(
      seller.auth,
      order.id,
      revItems(600) as never,
    )) as { revisionId: string };

    await orders.cancelRevision(seller.auth, order.id, proposed.revisionId);

    const row = await prisma.auditLog.findFirstOrThrow({
      where: {
        action: "company.order.revision_cancelled",
        entityId: proposed.revisionId,
      },
    });
    expect(row.actorId).toBe(seller.user.id);
    expect(row.metadata).toMatchObject({ orderId: order.id });
  });
});
