/**
 * Satıcının iptal talebini GERİ ÇEKMESİ — `POST /company/orders/:id/
 * cancel-request/withdraw` (`CompanyOrdersService.withdrawCancelRequest`).
 * Kardeş uçlar (talep aç / onayla / reddet) `order-workflow.spec`te; bu dosya
 * geri çekmenin durum geçişini, taraf + rol kapısını, audit izini ve alıcı
 * bildirimini kilitler.
 */
import { CompanyOrdersService } from "../../src/modules/company-orders/services/company-orders.service";
import { AuditService } from "../../src/modules/audit/audit.service";
import { NotificationService } from "../../src/modules/notifications/notification.service";
import { prisma, truncateAll } from "./test-db";
import { makeCompanyWithUser } from "./factories";
import { tApi } from "../../src/common/i18n/i18n.service";

const REASON = "fabrika yangını nedeniyle sevk edilemiyor";

function makeRig() {
  const email = {
    send: jest.fn().mockResolvedValue({ emailLogId: "test", sent: true }),
  };
  const config = { get: jest.fn().mockReturnValue("http://localhost:3000") };
  const orders = new CompanyOrdersService(
    prisma as never,
    email as never,
    config as never,
    new NotificationService(prisma as never),
    new AuditService(prisma as never),
    prisma as never, // RLS bypass client (testte aynı istemci)
  );
  return { orders, email };
}

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

async function acceptedOrder() {
  const seller = await makeCompanyWithUser(prisma, { country: "TR" });
  const buyer = await makeCompanyWithUser(prisma, { country: "TR" });
  const order = await prisma.companyOrder.create({
    data: {
      number: `ROT-ORD-${Math.floor(Math.random() * 900000 + 100000)}`,
      sellerCompanyId: seller.company.id,
      buyerCompanyId: buyer.company.id,
      amount: 1000,
      status: "ACCEPTED",
      acceptedAt: new Date(),
      paymentTiming: "AFTER_DELIVERY",
    } as never,
  });
  return { seller, buyer, order };
}

const load = (id: string) =>
  prisma.companyOrder.findUniqueOrThrow({ where: { id } });

describe("Satıcı iptal talebini geri çeker", () => {
  it("açık talep temizlenir, sipariş ACCEPTED kalır, yanıt { ok: true }", async () => {
    const { orders } = makeRig();
    const { seller, order } = await acceptedOrder();
    await orders.requestCancel(seller.auth, order.id, REASON);
    const open = await load(order.id);
    expect(open.cancelRequestedAt).not.toBeNull();
    expect(open.cancelRequestReason).toBe(REASON);
    expect(open.cancelRequestById).toBe(seller.user.id);

    const res = await orders.withdrawCancelRequest(seller.auth, order.id);

    expect(res).toEqual({ ok: true });
    const db = await load(order.id);
    expect(db.status).toBe("ACCEPTED");
    expect(db.cancelRequestedAt).toBeNull();
    expect(db.cancelRequestReason).toBeNull();
    expect(db.cancelRequestById).toBeNull();
    // İptal/ihtilaf damgası yok — sipariş hiç bozulmamış gibi sürer.
    expect(db.cancelledAt).toBeNull();
    expect(db.disputedAt).toBeNull();
  });

  it("alıcı geri çekemez (403); üçüncü firma siparişi göremez; talep açık kalır", async () => {
    const { orders } = makeRig();
    const { seller, buyer, order } = await acceptedOrder();
    const stranger = await makeCompanyWithUser(prisma, { country: "TR" });
    await orders.requestCancel(seller.auth, order.id, REASON);

    await expect(
      orders.withdrawCancelRequest(buyer.auth, order.id),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      orders.withdrawCancelRequest(stranger.auth, order.id),
    ).rejects.toMatchObject({ status: 404 });

    const db = await load(order.id);
    expect(db.cancelRequestedAt).not.toBeNull();
    expect(
      await prisma.auditLog.count({
        where: { action: "company.order.cancel_request_withdrawn" },
      }),
    ).toBe(0);
  });

  it("satıcı firmanın sipariş yönetimi izni olmayan üyesi geri çekemez (403)", async () => {
    const { orders } = makeRig();
    const { seller, order } = await acceptedOrder();
    await orders.requestCancel(seller.auth, order.id, REASON);
    const viewer = {
      ...seller.auth,
      roles: [],
      permissions: ["sell:view"],
    } as never;

    await expect(
      orders.withdrawCancelRequest(viewer, order.id),
    ).rejects.toMatchObject({ status: 403 });
    expect((await load(order.id)).cancelRequestedAt).not.toBeNull();
  });

  it("açık talep yokken 400; ikinci geri çekme de 400 (tek audit, tek bildirim)", async () => {
    const { orders } = makeRig();
    const { seller, buyer, order } = await acceptedOrder();

    await expect(
      orders.withdrawCancelRequest(seller.auth, order.id),
    ).rejects.toMatchObject({ status: 400 });

    await orders.requestCancel(seller.auth, order.id, REASON);
    await prisma.notification.deleteMany(); // "talep açıldı" bildirimi
    await orders.withdrawCancelRequest(seller.auth, order.id);
    await expect(
      orders.withdrawCancelRequest(seller.auth, order.id),
    ).rejects.toMatchObject({ status: 400 });

    expect(
      await prisma.auditLog.count({
        where: {
          action: "company.order.cancel_request_withdrawn",
          entityId: order.id,
        },
      }),
    ).toBe(1);
    // Başarısız denemeler bildirim üretmez: alıcının tek kullanıcısına tek satır.
    expect(
      await prisma.notification.count({
        where: { companyId: buyer.company.id, type: "order_status_changed" },
      }),
    ).toBe(1);
  });

  it("geri çekildikten sonra alıcı onaylayamaz/reddedemez (400) — sipariş ACCEPTED kalır", async () => {
    const { orders } = makeRig();
    const { seller, buyer, order } = await acceptedOrder();
    await orders.requestCancel(seller.auth, order.id, REASON);
    await orders.withdrawCancelRequest(seller.auth, order.id);

    await expect(
      orders.approveCancelRequest(buyer.auth, order.id),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      orders.rejectCancelRequest(buyer.auth, order.id, "mal bekliyorum"),
    ).rejects.toMatchObject({ status: 400 });

    const db = await load(order.id);
    expect(db.status).toBe("ACCEPTED");
    expect(db.cancelledAt).toBeNull();
    expect(db.disputedAt).toBeNull();
  });

  it("geri çekilen talep yeniden açılabilir; yeni talep onaylanınca yeni gerekçeyle iptal olur", async () => {
    const { orders } = makeRig();
    const { seller, buyer, order } = await acceptedOrder();
    await orders.requestCancel(seller.auth, order.id, REASON);
    await orders.withdrawCancelRequest(seller.auth, order.id);

    await orders.requestCancel(seller.auth, order.id, "ikinci gerekçe: hammadde yok");
    await orders.approveCancelRequest(buyer.auth, order.id);

    const db = await load(order.id);
    expect(db.status).toBe("CANCELLED");
    expect(db.cancelReason).toBe("ikinci gerekçe: hammadde yok");
  });

  it("audit izi (satıcı aktör, sipariş numarası) + alıcıya uygulama içi bildirim ve e-posta", async () => {
    const { orders, email } = makeRig();
    const { seller, buyer, order } = await acceptedOrder();
    await orders.requestCancel(seller.auth, order.id, REASON);
    await prisma.notification.deleteMany(); // "talep açıldı" bildirimi
    email.send.mockClear();

    await orders.withdrawCancelRequest(seller.auth, order.id);

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: "company.order.cancel_request_withdrawn" },
    });
    expect(audit).toMatchObject({
      actorType: "company",
      actorId: seller.user.id,
      tenantId: seller.company.id,
      entityType: "company_order",
      entityId: order.id,
    });
    expect(audit.metadata).toMatchObject({ orderNumber: order.number });

    // Bildirim ALICI firmaya, satın alma portalında; satıcıya kendi işlemi bildirilmez.
    const notes = await prisma.notification.findMany();
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({
      companyId: buyer.company.id,
      companyUserId: buyer.user.id,
      portal: "satinalma",
      type: "order_status_changed",
      title: tApi(
        "api.notifications.orders.cancelRequestWithdrawn.heading",
        { number: order.number! },
        "tr",
      ),
    });
    expect(notes[0]!.ctaUrl).toContain(order.id);
    const mails = email.send.mock.calls.map(
      (c) => (c[0] as { to: { email: string } }).to.email,
    );
    expect(mails).toEqual([buyer.user.email]);
  });

  it("ihtilaftaki (alıcı reddetti → DISPUTED) siparişte geri çekilecek açık talep yoktur (400)", async () => {
    // Bugünkü kural: geri çekme yalnız ACCEPTED + açık talepte. DISPUTED'dan
    // çıkış sevk (satıcı) ya da iptali onaylama (alıcı) — `order-workflow.spec`.
    const { orders } = makeRig();
    const { seller, buyer, order } = await acceptedOrder();
    await orders.requestCancel(seller.auth, order.id, REASON);
    await orders.rejectCancelRequest(buyer.auth, order.id, "mal bekliyorum");

    await expect(
      orders.withdrawCancelRequest(seller.auth, order.id),
    ).rejects.toMatchObject({ status: 400 });
    expect((await load(order.id)).status).toBe("DISPUTED");
  });
});
