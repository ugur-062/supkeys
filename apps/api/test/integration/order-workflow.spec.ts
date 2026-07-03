/**
 * Sipariş adım makinesi — karşılıklı onay akışının regresyon testleri:
 * mutlu yol (iki ödeme zamanı), taraf/durum guard'ları, teminat mektubu
 * (peşin iş), ödeme tavanı, çift karar, iptal pencereleri, oto-tamamlama
 * damgaları. ALIM/SATIS kaynaklı siparişler seller/buyer normalize edildiği
 * için akış rol bazlıdır — testler rol üzerinden her iki kaynağı da kapsar.
 */
import { CompanyOrdersService } from "../../src/modules/company-orders/services/company-orders.service";
import { NotificationService } from "../../src/modules/notifications/notification.service";
import { prisma, truncateAll } from "./test-db";
import { makeCompanyWithUser, makeListing } from "./factories";

const future = (days: number) => new Date(Date.now() + days * 86_400_000);

function makeOrdersService() {
  const email = { send: jest.fn().mockResolvedValue({ emailLogId: "test" }) };
  const config = { get: jest.fn().mockReturnValue("http://localhost:3000") };
  const notifications = new NotificationService(prisma as never);
  return new CompanyOrdersService(
    prisma as never,
    email as never,
    config as never,
    notifications,
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

const acceptInput = { expectedDeliveryDate: future(5).toISOString() };

describe("mutlu yol — AFTER_DELIVERY (teslim sonrası ödeme)", () => {
  it("accept → ship → receive → tam ödeme onayı → oto-COMPLETED (damgalarla)", async () => {
    const orders = makeOrdersService();
    const { seller, buyer } = await twoParties();
    const order = await makeOrder(seller.company.id, buyer.company.id);

    await orders.accept(seller.auth, order.id, acceptInput as never);
    await orders.ship(seller.auth, order.id, { invoiceNumber: "FTR-1" } as never);
    const rec = await orders.receive(buyer.auth, order.id, {} as never);
    expect(rec.status).toBe("DELIVERED"); // AFTER_DELIVERY: ödeme adımı açılır

    const payment = (await orders.recordPayment(buyer.auth, order.id, {
      amount: 1000,
      method: "EFT",
    } as never)) as { id: string };
    await orders.confirmPayment(seller.auth, order.id, payment.id);

    const db = await prisma.companyOrder.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(db.status).toBe("COMPLETED"); // tam ödeme → oto-tamamlama
    expect(db.acceptedAt).not.toBeNull();
    expect(db.deliveryStartedAt).not.toBeNull();
    expect(db.deliveredAt).not.toBeNull();
    expect(db.completedAt).not.toBeNull(); // oto-tamamlamada damga eksikti
    expect(db.invoiceNumber).toBe("FTR-1");
  });
});

describe("BEFORE_DELIVERY (teslim öncesi ödeme) — teslim alma davranışı", () => {
  it("tam ödeme onaylı DEĞİLKEN teslim alma DELIVERED'a gider ve ödeme penceresi açık kalır", async () => {
    const orders = makeOrdersService();
    const { seller, buyer } = await twoParties();
    const order = await makeOrder(seller.company.id, buyer.company.id, {
      status: "IN_DELIVERY",
      paymentTiming: "BEFORE_DELIVERY",
      acceptedAt: new Date(),
      deliveryStartedAt: new Date(),
    });

    // Eskiden koşulsuz COMPLETED'a atlıyordu — hiç ödeme yokken.
    const rec = await orders.receive(buyer.auth, order.id, {} as never);
    expect(rec.status).toBe("DELIVERED");

    // Kalan ödeme DELIVERED'da kaydedilebilmeli (pencere kapanmasın).
    const payment = (await orders.recordPayment(buyer.auth, order.id, {
      amount: 1000,
      method: "EFT",
    } as never)) as { id: string };
    await orders.confirmPayment(seller.auth, order.id, payment.id);
    const db = await prisma.companyOrder.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(db.status).toBe("COMPLETED");
    expect(db.completedAt).not.toBeNull();
  });

  it("tam ödeme ONAYLIYKEN teslim alma doğrudan COMPLETED'a gider", async () => {
    const orders = makeOrdersService();
    const { seller, buyer } = await twoParties();
    const order = await makeOrder(seller.company.id, buyer.company.id, {
      status: "IN_DELIVERY",
      paymentTiming: "BEFORE_DELIVERY",
      acceptedAt: new Date(),
      deliveryStartedAt: new Date(),
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

    const rec = await orders.receive(buyer.auth, order.id, {} as never);
    expect(rec.status).toBe("COMPLETED");
  });
});

describe("taraf ve durum guard'ları", () => {
  it("yanlış taraf hiçbir adımı atamaz (alıcı accept/ship, satıcı receive/complete/cancel)", async () => {
    const orders = makeOrdersService();
    const { seller, buyer } = await twoParties();
    const order = await makeOrder(seller.company.id, buyer.company.id);

    await expect(
      orders.accept(buyer.auth, order.id, acceptInput as never),
    ).rejects.toThrow(/yapamazsınız/);
    await expect(
      orders.ship(buyer.auth, order.id, { invoiceNumber: "X" } as never),
    ).rejects.toThrow(/yapamazsınız/);
    await expect(
      orders.receive(seller.auth, order.id, {} as never),
    ).rejects.toThrow(/yapamazsınız/);
    await expect(
      orders.complete(seller.auth, order.id, {} as never),
    ).rejects.toThrow(/yapamazsınız/);
    await expect(orders.cancel(seller.auth, order.id)).rejects.toThrow(
      /yapamazsınız/,
    );
    // Üçüncü firma siparişi hiç göremez.
    const outsider = await makeCompanyWithUser(prisma, { country: "TR" });
    await expect(
      orders.accept(outsider.auth, order.id, acceptInput as never),
    ).rejects.toThrow(/bulunamadı/);
  });

  it("yanlış durumda adım reddedilir; iptal yalnız teslimat öncesi", async () => {
    const orders = makeOrdersService();
    const { seller, buyer } = await twoParties();
    const order = await makeOrder(seller.company.id, buyer.company.id);

    // PENDING'de ship/receive/complete olmaz.
    await expect(
      orders.ship(seller.auth, order.id, { invoiceNumber: "X" } as never),
    ).rejects.toThrow(/uygun değil/);
    await expect(
      orders.receive(buyer.auth, order.id, {} as never),
    ).rejects.toThrow(/uygun değil/);

    await orders.accept(seller.auth, order.id, acceptInput as never);
    // ACCEPTED'da alıcı hâlâ iptal edebilir.
    // (ayrı siparişte doğrula — bu siparişi akışta tutuyoruz)
    await expect(
      orders.accept(seller.auth, order.id, acceptInput as never),
    ).rejects.toThrow(/uygun değil/); // çift accept

    await orders.ship(seller.auth, order.id, { invoiceNumber: "F-1" } as never);
    // Kargodayken alıcı iptal EDEMEZ.
    await expect(orders.cancel(buyer.auth, order.id)).rejects.toThrow(
      /uygun değil/,
    );
  });

  it("reddedilen sipariş gerekçesiyle tek yazmada REJECTED olur", async () => {
    const orders = makeOrdersService();
    const { seller, buyer } = await twoParties();
    const order = await makeOrder(seller.company.id, buyer.company.id);
    await orders.reject(seller.auth, order.id, "stok kalmadı");
    const db = await prisma.companyOrder.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(db.status).toBe("REJECTED");
    expect(db.rejectedReason).toBe("stok kalmadı");
    expect(db.rejectedAt).not.toBeNull();
  });
});

describe("teminat mektubu — peşin (CASH) iş", () => {
  it("CASH ilan kaynaklı sipariş, teminat belgesi yüklenmeden onaylanamaz", async () => {
    const orders = makeOrdersService();
    const { seller, buyer } = await twoParties();
    const listing = await makeListing(prisma, {
      companyId: buyer.company.id,
      createdById: buyer.user.id,
      type: "ALIM",
      status: "AWARDED",
      paymentTerm: "CASH",
    });
    const order = await makeOrder(seller.company.id, buyer.company.id, {
      listingId: listing.id,
    });

    await expect(
      orders.accept(seller.auth, order.id, acceptInput as never),
    ).rejects.toThrow(/teminat mektubu/);

    // Teminat yüklenince onay geçer.
    await prisma.companyOrderDocument.create({
      data: {
        orderId: order.id,
        type: "TEMINAT",
        key: `company-orders/${order.id}/teminat/x.pdf`,
        fileName: "teminat.pdf",
        mimeType: "application/pdf",
        uploadedByCompanyId: seller.company.id,
      },
    });
    const res = await orders.accept(seller.auth, order.id, acceptInput as never);
    expect(res.status).toBe("ACCEPTED");
  });

  it("vadeli (DEFERRED) işte teminat istenmez", async () => {
    const orders = makeOrdersService();
    const { seller, buyer } = await twoParties();
    const listing = await makeListing(prisma, {
      companyId: buyer.company.id,
      createdById: buyer.user.id,
      type: "ALIM",
      status: "AWARDED",
      paymentTerm: "DEFERRED",
    });
    const order = await makeOrder(seller.company.id, buyer.company.id, {
      listingId: listing.id,
    });
    const res = await orders.accept(seller.auth, order.id, acceptInput as never);
    expect(res.status).toBe("ACCEPTED");
  });
});

describe("ödeme kuralları", () => {
  it("tavan: kalan tutarı aşan ödeme reddedilir; satıcı ödeme kaydedemez", async () => {
    const orders = makeOrdersService();
    const { seller, buyer } = await twoParties();
    const order = await makeOrder(seller.company.id, buyer.company.id, {
      status: "DELIVERED",
      deliveredAt: new Date(),
    });

    await expect(
      orders.recordPayment(seller.auth, order.id, { amount: 100 } as never),
    ).rejects.toThrow(/yalnızca alıcı/);

    await orders.recordPayment(buyer.auth, order.id, { amount: 800 } as never);
    await expect(
      orders.recordPayment(buyer.auth, order.id, { amount: 300 } as never),
    ).rejects.toThrow(/aşan ödeme/);
  });

  it("ödeme kararı atomik: ikinci onay/red 'zaten sonuçlanmış' der", async () => {
    const orders = makeOrdersService();
    const { seller, buyer } = await twoParties();
    const order = await makeOrder(seller.company.id, buyer.company.id, {
      status: "DELIVERED",
      deliveredAt: new Date(),
    });
    const payment = (await orders.recordPayment(buyer.auth, order.id, {
      amount: 400,
    } as never)) as { id: string };

    await orders.confirmPayment(seller.auth, order.id, payment.id);
    await expect(
      orders.rejectPayment(seller.auth, order.id, payment.id, "geç"),
    ).rejects.toThrow(/zaten sonuçlanmış/);
    // Alıcı ödeme kararı veremez.
    const p2 = (await orders.recordPayment(buyer.auth, order.id, {
      amount: 100,
    } as never)) as { id: string };
    await expect(
      orders.confirmPayment(buyer.auth, order.id, p2.id),
    ).rejects.toThrow(/yalnızca satıcı/);
  });

  it("kısmi ödemeyle tamamlanan siparişte kalan ödeme COMPLETED'da da kaydedilebilir", async () => {
    const orders = makeOrdersService();
    const { seller, buyer } = await twoParties();
    const order = await makeOrder(seller.company.id, buyer.company.id, {
      status: "DELIVERED",
      deliveredAt: new Date(),
    });
    const p1 = (await orders.recordPayment(buyer.auth, order.id, {
      amount: 400,
    } as never)) as { id: string };
    await orders.confirmPayment(seller.auth, order.id, p1.id);
    await orders.complete(buyer.auth, order.id, {} as never);

    // Pencere kapanmıyor — bakiye takibi sürer (tavan yine korur).
    const p2 = (await orders.recordPayment(buyer.auth, order.id, {
      amount: 600,
    } as never)) as { id: string };
    await orders.confirmPayment(seller.auth, order.id, p2.id);
    const totals = await orders.getOne(buyer.auth, order.id);
    expect(Number(totals.paymentTotals.confirmed)).toBe(1000);
    expect(Number(totals.paymentTotals.remaining)).toBe(0);
  });
});
