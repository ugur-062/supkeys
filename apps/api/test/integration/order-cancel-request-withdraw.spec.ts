/**
 * Satıcının iptal talebini GERİ ÇEKMESİ — `POST /company/orders/:id/
 * cancel-request/withdraw` (`CompanyOrdersService.withdrawCancelRequest`).
 * Kardeş uçlar (talep aç / onayla / reddet) `order-workflow.spec`te; bu dosya
 * geri çekmenin durum geçişini, taraf + rol kapısını, audit izini ve alıcı
 * bildirimini kilitler.
 *
 * İki dal (kullanıcı kararı 2026-10-07): ACCEPTED + açık talep (sipariş aynen
 * sürer) ve A1-DISPUTED — alıcı talebi reddettikten sonra satıcı talebini geri
 * çeker, ihtilaf biter, sipariş ACCEPTED'a döner. Ayıp ihbarından doğan
 * ihtilaf bu uçtan çözülmez (400).
 */
import { CompanyOrdersService } from "../../src/modules/company-orders/services/company-orders.service";
import { AuditService } from "../../src/modules/audit/audit.service";
import { NotificationService } from "../../src/modules/notifications/notification.service";
import { PrismaClient } from "@rothern/db";
import { TEST_DB_URL } from "./env";
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
});

describe("Satıcı iptal talebini İHTİLAFTA geri çeker (alıcı reddetti → DISPUTED)", () => {
  /** ACCEPTED → satıcı iptal talebi → alıcı reddi = A1 ihtilafı. */
  async function disputedOrder() {
    const { orders, email } = makeRig();
    const ctx = await acceptedOrder();
    await orders.requestCancel(ctx.seller.auth, ctx.order.id, REASON);
    await orders.rejectCancelRequest(ctx.buyer.auth, ctx.order.id, "mal bekliyorum");
    const before = await load(ctx.order.id);
    expect(before.status).toBe("DISPUTED");
    expect(before.disputedAt).not.toBeNull();
    expect(before.cancelRequestedAt).not.toBeNull();
    return { orders, email, ...ctx };
  }

  it("sipariş ihtilaftan önceki durumuna (ACCEPTED) döner; talep ve ihtilaf damgaları temizlenir", async () => {
    const { orders, seller, order } = await disputedOrder();

    const res = await orders.withdrawCancelRequest(seller.auth, order.id);

    expect(res).toEqual({ ok: true, status: "ACCEPTED" });
    const db = await load(order.id);
    expect(db.status).toBe("ACCEPTED");
    // Açık talep dalıyla AYNI temizlik + ihtilaf damgası.
    expect(db.cancelRequestedAt).toBeNull();
    expect(db.cancelRequestReason).toBeNull();
    expect(db.cancelRequestById).toBeNull();
    expect(db.disputedAt).toBeNull();
    expect(db.disputePrevStatus).toBeNull();
    // İptal edilmedi; onay damgası yerinde — sipariş kaldığı yerden sürer.
    expect(db.cancelledAt).toBeNull();
    expect(db.cancelReason).toBeNull();
    expect(db.acceptedAt).not.toBeNull();
  });

  it("audit izi DISPUTED → ACCEPTED geçişini yazar; alıcıya 'ihtilaf sona erdi' bildirimi + e-posta", async () => {
    const { orders, email, seller, buyer, order } = await disputedOrder();
    await prisma.notification.deleteMany(); // talep + ret bildirimleri
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
    expect(audit.metadata).toMatchObject({
      orderNumber: order.number,
      from: "DISPUTED",
      to: "ACCEPTED",
    });

    // Yalnız ALICI firmaya, satın alma portalında; satıcıya ve yöneticilere
    // bildirim yok (ihtilaf açılırken de yöneticilere bildirim gitmiyor).
    const notes = await prisma.notification.findMany();
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({
      companyId: buyer.company.id,
      companyUserId: buyer.user.id,
      portal: "satinalma",
      type: "order_status_changed",
      title: tApi(
        "api.notifications.orders.cancelRequestWithdrawnDisputeEnded.heading",
        { number: order.number! },
        "tr",
      ),
    });
    expect(notes[0]!.body).toContain("İhtilaf sona erdi");
    expect(notes[0]!.ctaUrl).toContain(order.id);
    // Okuma anında yeniden üretim: satır katalog anahtarını saklar, çevrilmiş
    // metni değil (bildirim dili kuralı).
    expect(notes[0]!.i18n).toMatchObject({
      titleKey:
        "api.notifications.orders.cancelRequestWithdrawnDisputeEnded.heading",
      bodyKey:
        "api.notifications.orders.cancelRequestWithdrawnDisputeEnded.body",
    });
    const mails = email.send.mock.calls.map(
      (c) =>
        c[0] as { to: { email: string }; subject: string },
    );
    expect(mails.map((m) => m.to.email)).toEqual([buyer.user.email]);
    expect(mails[0]!.subject).toBe(
      tApi(
        "api.notifications.orders.cancelRequestWithdrawnDisputeEnded.subject",
        { number: order.number! },
        "tr",
      ),
    );
  });

  it("alıcı geri çekemez (403); üçüncü firma siparişi göremez (404); izinsiz satıcı üyesi 403 — sipariş ihtilafta kalır", async () => {
    const { orders, seller, buyer, order } = await disputedOrder();
    const stranger = await makeCompanyWithUser(prisma, { country: "TR" });
    const viewer = {
      ...seller.auth,
      roles: [],
      permissions: ["sell:view"],
    } as never;

    await expect(
      orders.withdrawCancelRequest(buyer.auth, order.id),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      orders.withdrawCancelRequest(stranger.auth, order.id),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      orders.withdrawCancelRequest(viewer, order.id),
    ).rejects.toMatchObject({ status: 403 });

    const db = await load(order.id);
    expect(db.status).toBe("DISPUTED");
    expect(db.cancelRequestedAt).not.toBeNull();
    expect(db.disputedAt).not.toBeNull();
    expect(
      await prisma.auditLog.count({
        where: { action: "company.order.cancel_request_withdrawn" },
      }),
    ).toBe(0);
  });

  it("ayıp ihbarından doğan ihtilaf bu uçtan çözülmez (400) — sipariş ihtilafta, ihbar yerinde kalır", async () => {
    const { orders } = makeRig();
    const { seller, buyer, order } = await acceptedOrder();
    await prisma.companyOrder.update({
      where: { id: order.id },
      data: { status: "DELIVERED", deliveredAt: new Date() },
    });
    await orders.raiseDefectNotice(buyer.auth, order.id, "ürün ezik ve kırık geldi");

    await expect(
      orders.withdrawCancelRequest(seller.auth, order.id),
    ).rejects.toMatchObject({ status: 400 });

    const db = await load(order.id);
    expect(db.status).toBe("DISPUTED");
    expect(db.defectNotifiedAt).not.toBeNull();
    expect(db.disputePrevStatus).toBe("DELIVERED");
  });

  it("ayıp ihtilafında satırda ESKİ iptal talebi damgası kalmış olsa da geri çekilemez (400)", async () => {
    // Yol: iptal talebi → ret (DISPUTED) → satıcı sevk etti → teslim → alıcı ayıp
    // ihbarı. Sevk iptal talebi damgasını silmez; ihtilafın kaynağı artık ayıp.
    const { orders, seller, buyer, order } = await disputedOrder();
    await orders.ship(seller.auth, order.id, { invoiceNumber: "FTR-1" } as never);
    await prisma.companyOrder.update({
      where: { id: order.id },
      data: { status: "DELIVERED", deliveredAt: new Date() },
    });
    await orders.raiseDefectNotice(buyer.auth, order.id, "ürün ezik ve kırık geldi");
    const before = await load(order.id);
    expect(before.cancelRequestedAt).not.toBeNull();

    await expect(
      orders.withdrawCancelRequest(seller.auth, order.id),
    ).rejects.toMatchObject({ status: 400 });

    const db = await load(order.id);
    expect(db.status).toBe("DISPUTED");
    expect(db.defectNotifiedAt).not.toBeNull();
    expect(db.disputePrevStatus).toBe("DELIVERED");
    expect(db.cancelRequestedAt).not.toBeNull();
  });

  it("ikinci geri çekme 400 (tek audit, tek bildirim); alıcı artık iptali onaylayamaz", async () => {
    const { orders, seller, buyer, order } = await disputedOrder();
    await prisma.notification.deleteMany();

    await orders.withdrawCancelRequest(seller.auth, order.id);
    await expect(
      orders.withdrawCancelRequest(seller.auth, order.id),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      orders.approveCancelRequest(buyer.auth, order.id),
    ).rejects.toMatchObject({ status: 400 });

    expect((await load(order.id)).status).toBe("ACCEPTED");
    expect(
      await prisma.auditLog.count({
        where: {
          action: "company.order.cancel_request_withdrawn",
          entityId: order.id,
        },
      }),
    ).toBe(1);
    expect(
      await prisma.notification.count({
        where: { companyId: buyer.company.id, type: "order_status_changed" },
      }),
    ).toBe(1);
  });

  it("sipariş devam eder: geri çekmeden sonra satıcı sevk edebilir (ACCEPTED → IN_DELIVERY)", async () => {
    const { orders, seller, order } = await disputedOrder();
    await orders.withdrawCancelRequest(seller.auth, order.id);

    const res = await orders.ship(seller.auth, order.id, {
      invoiceNumber: "FTR-2",
    } as never);

    expect(res.status).toBe("IN_DELIVERY");
    const db = await load(order.id);
    expect(db.status).toBe("IN_DELIVERY");
    // Eski talep/ihtilaf damgası kalmadı → zaman çizelgesinde hayalet olay yok.
    expect(db.cancelRequestedAt).toBeNull();
    expect(db.disputedAt).toBeNull();
  });

  it("geri çekmeden sonra YENİ iptal talebi açılabilir; onaylanınca yeni gerekçeyle iptal olur", async () => {
    const { orders, seller, buyer, order } = await disputedOrder();
    await orders.withdrawCancelRequest(seller.auth, order.id);

    await orders.requestCancel(seller.auth, order.id, "ikinci gerekçe: hammadde yok");
    const open = await load(order.id);
    expect(open.status).toBe("ACCEPTED");
    expect(open.cancelRequestReason).toBe("ikinci gerekçe: hammadde yok");
    // Yeni talep yeniden reddedilip yeniden ihtilafa da dönebilir.
    await orders.rejectCancelRequest(buyer.auth, order.id);
    expect((await load(order.id)).status).toBe("DISPUTED");
    await orders.approveCancelRequest(buyer.auth, order.id);

    const db = await load(order.id);
    expect(db.status).toBe("CANCELLED");
    expect(db.cancelReason).toBe("ikinci gerekçe: hammadde yok");
  });

  it("yarış: satıcının geri çekmesi ile alıcının iptal onayı aynı anda → TAM OLARAK BİRİ kazanır", async () => {
    // Paylaşılan test istemcisi connection_limit=1 (çağrılar zaten seri) —
    // yarışı gerçekten koşturmak için çok bağlantılı ayrı istemci.
    const base = TEST_DB_URL.replace(/[?&]connection_limit=\d+/, "");
    const multi = new PrismaClient({
      datasources: {
        db: { url: `${base}${base.includes("?") ? "&" : "?"}connection_limit=4` },
      },
    });
    const email = {
      send: jest.fn().mockResolvedValue({ emailLogId: "test", sent: true }),
    };
    const config = { get: jest.fn().mockReturnValue("http://localhost:3000") };
    const racing = new CompanyOrdersService(
      multi as never,
      email as never,
      config as never,
      new NotificationService(multi as never),
      new AuditService(multi as never),
      multi as never,
    );
    try {
      let withdrawWins = 0;
      let approveWins = 0;
      for (let round = 0; round < 12; round += 1) {
        const { seller, buyer, order } = await disputedOrder();
        // Sıra her turda değişir: kazanan çağrı sırasına bağlı kalmasın.
        const calls =
          round % 2 === 0
            ? [
                racing.withdrawCancelRequest(seller.auth, order.id),
                racing.approveCancelRequest(buyer.auth, order.id),
              ]
            : [
                racing.approveCancelRequest(buyer.auth, order.id),
                racing.withdrawCancelRequest(seller.auth, order.id),
              ];
        const settled = await Promise.allSettled(calls);
        const [withdrawn, approved] =
          round % 2 === 0 ? settled : [settled[1]!, settled[0]!];

        const winners = settled.filter((r) => r.status === "fulfilled");
        expect(winners).toHaveLength(1);
        const loser = settled.find((r) => r.status === "rejected") as
          | PromiseRejectedResult
          | undefined;
        expect(loser?.reason).toMatchObject({ status: 400 });

        const db = await load(order.id);
        const audits = await prisma.auditLog.findMany({
          where: {
            entityId: order.id,
            action: {
              in: [
                "company.order.cancel_request_withdrawn",
                "company.order.cancel_request_approved",
              ],
            },
          },
          select: { action: true },
        });
        expect(audits).toHaveLength(1);
        if (withdrawn!.status === "fulfilled") {
          withdrawWins += 1;
          expect(approved!.status).toBe("rejected");
          expect(db.status).toBe("ACCEPTED");
          expect(db.cancelledAt).toBeNull();
          expect(db.cancelRequestedAt).toBeNull();
          expect(db.disputedAt).toBeNull();
          expect(audits[0]!.action).toBe("company.order.cancel_request_withdrawn");
        } else {
          approveWins += 1;
          expect(db.status).toBe("CANCELLED");
          expect(db.cancelledAt).not.toBeNull();
          expect(audits[0]!.action).toBe("company.order.cancel_request_approved");
        }
      }
      expect(withdrawWins + approveWins).toBe(12);
    } finally {
      await multi.$disconnect();
    }
  });
});
