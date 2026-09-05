/**
 * Denetim 2026-08-23 Parça 3 (Sipariş & para) — Dalga A regresyonları.
 * Rapor: docs/audit-2026-08-23-part3-orders.md (#2, #3, #4, #6, #7 + HIGH SSRF).
 */
import { AuditService } from "../../src/modules/audit/audit.service";
import { AdminInspectionService } from "../../src/modules/admin-companies/admin-inspection.service";
import { CompanyOrdersService } from "../../src/modules/company-orders/services/company-orders.service";
import { NotificationService } from "../../src/modules/notifications/notification.service";
import { assertPublicHttpUrl } from "../../src/common/website-import";
import { makeCompanyWithUser } from "./factories";
import { prisma, truncateAll } from "./test-db";

const future = (days: number) => new Date(Date.now() + days * 86_400_000);

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

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

async function twoParties() {
  const seller = await makeCompanyWithUser(prisma, { country: "TR" });
  const buyer = await makeCompanyWithUser(prisma, { country: "TR" });
  return { seller, buyer };
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

describe("#2 — A1 ihtilafında (DISPUTED) satıcının sevk çıkışı gerçekten açık", () => {
  it("peşin sipariş: DISPUTED'ta alıcı ödeme kaydeder → satıcı onaylar → sevk geçer", async () => {
    const orders = makeOrdersService();
    const { seller, buyer } = await twoParties();
    const order = await makeOrder(seller.company.id, buyer.company.id, {
      status: "DISPUTED",
      paymentTiming: "BEFORE_DELIVERY",
      paymentCategory: "ADVANCE",
      advancePercent: 100,
      acceptedAt: new Date(),
      disputedAt: new Date(),
      cancelRequestedAt: new Date(),
      cancelRequestReason: "Mal bulunamadı gibi görünüyordu",
    });
    const rec = (await orders.recordPayment(buyer.auth, order.id, {
      amount: 1000,
    } as never)) as { id: string };
    await orders.confirmPayment(seller.auth, order.id, rec.id);
    const res = await orders.ship(seller.auth, order.id, {
      invoiceNumber: "F-A1",
    } as never);
    expect(res.status).toBe("IN_DELIVERY");
  });

  it("akreditif: DISPUTED'ta LC açıldı/kabul adımları işler → sevk geçer", async () => {
    const orders = makeOrdersService();
    const { seller, buyer } = await twoParties();
    const order = await makeOrder(seller.company.id, buyer.company.id, {
      status: "DISPUTED",
      paymentTiming: "BEFORE_DELIVERY",
      paymentCategory: "LETTER_OF_CREDIT",
      lcType: "SIGHT",
      acceptedAt: new Date(),
      disputedAt: new Date(),
      cancelRequestedAt: new Date(),
      cancelRequestReason: "Tedarik sorunu yaşandı",
    });
    await orders.lcMarkOpened(buyer.auth, order.id);
    await orders.lcMarkAccepted(seller.auth, order.id);
    const res = await orders.ship(seller.auth, order.id, {
      invoiceNumber: "F-LC",
    } as never);
    expect(res.status).toBe("IN_DELIVERY");
  });

  it("ayıp ihbarlı DISPUTED (TTK-23): ödeme penceresi ve LC adımları KAPALI kalır", async () => {
    const orders = makeOrdersService();
    const { seller, buyer } = await twoParties();
    const order = await makeOrder(seller.company.id, buyer.company.id, {
      status: "DISPUTED",
      paymentTiming: "BEFORE_DELIVERY",
      paymentCategory: "ADVANCE",
      advancePercent: 100,
      acceptedAt: new Date(),
      deliveredAt: new Date(),
      disputedAt: new Date(),
      defectNotifiedAt: new Date(),
      defectReason: "Ürünler hasarlı geldi",
      disputePrevStatus: "DELIVERED",
    });
    await expect(
      orders.recordPayment(buyer.auth, order.id, { amount: 100 } as never),
    ).rejects.toThrow(/uygun değil/i);

    const lc = await makeOrder(seller.company.id, buyer.company.id, {
      status: "DISPUTED",
      paymentTiming: "BEFORE_DELIVERY",
      paymentCategory: "LETTER_OF_CREDIT",
      lcType: "SIGHT",
      acceptedAt: new Date(),
      deliveredAt: new Date(),
      disputedAt: new Date(),
      defectNotifiedAt: new Date(),
      defectReason: "Ürünler hasarlı geldi",
    });
    await expect(orders.lcMarkOpened(buyer.auth, lc.id)).rejects.toThrow(
      /uygun değil/i,
    );
  });
});

describe("#4 — akreditif adımları audit izi bırakır", () => {
  it("lcMarkPaid: CONFIRMED ödeme + company.order.payment_confirmed izi (source: letter_of_credit)", async () => {
    const orders = makeOrdersService();
    const { seller, buyer } = await twoParties();
    const order = await makeOrder(seller.company.id, buyer.company.id, {
      status: "IN_DELIVERY",
      paymentTiming: "BEFORE_DELIVERY",
      paymentCategory: "LETTER_OF_CREDIT",
      lcType: "SIGHT",
      acceptedAt: new Date(),
      lcOpenedAt: new Date(),
      lcAcceptedAt: new Date(),
      deliveryStartedAt: new Date(),
    });
    await orders.lcMarkPaid(seller.auth, order.id);
    const pay = await prisma.companyOrderPayment.findFirstOrThrow({
      where: { orderId: order.id },
    });
    expect(pay.status).toBe("CONFIRMED");
    const log = await prisma.auditLog.findFirst({
      where: {
        action: "company.order.payment_confirmed",
        tenantId: seller.company.id,
      },
      select: { metadata: true, entityId: true },
    });
    expect(log).not.toBeNull();
    expect((log!.metadata as { source?: string }).source).toBe(
      "letter_of_credit",
    );
    expect(log!.entityId).toBe(pay.id);
  });

  it("lcMarkOpened / lcMarkAccepted beyan izleri yazılır", async () => {
    const orders = makeOrdersService();
    const { seller, buyer } = await twoParties();
    const order = await makeOrder(seller.company.id, buyer.company.id, {
      status: "ACCEPTED",
      paymentTiming: "BEFORE_DELIVERY",
      paymentCategory: "LETTER_OF_CREDIT",
      lcType: "SIGHT",
      acceptedAt: new Date(),
    });
    await orders.lcMarkOpened(buyer.auth, order.id);
    await orders.lcMarkAccepted(seller.auth, order.id);
    const actions = (
      await prisma.auditLog.findMany({
        where: { entityId: order.id },
        select: { action: true },
      })
    ).map((a) => a.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        "company.order.lc_opened",
        "company.order.lc_accepted",
      ]),
    );
  });
});

describe("#6 — ödeme sinyali: detay paymentSettled ile liste birebir", () => {
  it("yalnız BEKLEYEN ödeme varken remaining=0 olsa da paymentSettled=false", async () => {
    const orders = makeOrdersService();
    const { seller, buyer } = await twoParties();
    const order = await makeOrder(seller.company.id, buyer.company.id, {
      status: "DELIVERED",
      paymentTiming: "AFTER_DELIVERY",
      paymentCategory: "DEFERRED",
      paymentDays: 30,
      acceptedAt: new Date(),
      deliveredAt: new Date(),
    });
    await orders.recordPayment(buyer.auth, order.id, {
      amount: 1000,
    } as never);
    const detail = (await orders.getOne(buyer.auth, order.id)) as {
      paymentTotals: { remaining: string; pending: string };
      paymentSettled: boolean;
    };
    expect(detail.paymentTotals.pending).toBe("1000.00");
    expect(detail.paymentTotals.remaining).toBe("0.00"); // bildirilebilir kalan
    expect(detail.paymentSettled).toBe(false); // borç KAPANMADI
    const list = (await orders.list(buyer.auth)) as {
      id: string;
      paymentSettled: boolean;
    }[];
    expect(list.find((r) => r.id === order.id)?.paymentSettled).toBe(false);
  });
});

describe("#3 — admin sipariş detayı PII taşımaz", () => {
  it("bankIban / bankAccountHolder / deliveryAddress payload'da YOK", async () => {
    const { seller, buyer } = await twoParties();
    const order = await makeOrder(seller.company.id, buyer.company.id, {
      status: "ACCEPTED",
      acceptedAt: new Date(),
      bankIban: "TR330006100519786457841326",
      bankAccountHolder: "Test Firma A.Ş.",
      deliveryAddress: {
        title: "Merkez",
        contactName: "Ayşe Yılmaz",
        phone: "05001112233",
        addressLine: "Örnek Mah. 1. Sk. No:2",
      },
      expectedDeliveryDate: future(5),
    });
    const svc = new AdminInspectionService(
      prisma as never,
      new AuditService(prisma as never) as never,
      {} as never, // AdminCompaniesService — orderDetail kullanmaz
    );
    const detail = await svc.orderDetail(order.id);
    expect(detail).not.toHaveProperty("bankIban");
    expect(detail).not.toHaveProperty("bankAccountHolder");
    expect(detail).not.toHaveProperty("deliveryAddress");
    // Destek triyajı için gereken alanlar duruyor.
    expect(detail).toHaveProperty("number");
    expect(detail).toHaveProperty("paymentConfirmed");
    expect(detail).toHaveProperty("items");
    expect(detail).toHaveProperty("payments");
  });
});

describe("HIGH (Parça 3 turu) — SSRF: özel ağ adresleri çekilemez", () => {
  it("assertPublicHttpUrl loopback/metadata/özel ağ ve http-dışı şemaları reddeder", () => {
    for (const bad of [
      "http://127.0.0.1:4000/health",
      "http://localhost/admin",
      "http://169.254.169.254/latest/meta-data/",
      "http://10.0.0.5/",
      "http://192.168.1.1/",
      "http://172.16.0.9/",
      "http://[::1]/",
      "file:///etc/passwd",
      "gopher://evil/",
    ]) {
      expect(() => assertPublicHttpUrl(bad)).toThrow();
    }
    expect(() => assertPublicHttpUrl("https://www.rothern.com")).not.toThrow();
  });
});
