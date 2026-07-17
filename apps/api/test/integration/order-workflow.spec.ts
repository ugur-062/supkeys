/**
 * Sipariş adım makinesi — karşılıklı onay akışının regresyon testleri:
 * mutlu yol (iki ödeme zamanı), taraf/durum guard'ları, teminat mektubu
 * (peşin iş), ödeme tavanı, çift karar, iptal pencereleri, oto-tamamlama
 * damgaları. ALIM/SATIS kaynaklı siparişler seller/buyer normalize edildiği
 * için akış rol bazlıdır — testler rol üzerinden her iki kaynağı da kapsar.
 */
import { CompanyOrdersService } from "../../src/modules/company-orders/services/company-orders.service";
import { AuditService } from "../../src/modules/audit/audit.service";
import { NotificationService } from "../../src/modules/notifications/notification.service";
import { MAX_MONEY } from "../../src/common/constants/money";
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
    new AuditService(prisma as never),
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

/** accept artık kayıtlı banka hesabı ister (ödeme alınacak hesap) — satıcıya
 *  bir hesap açıp id'siyle onay girdisi döndürür. */
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

describe("teslim şekline göre gönderim bildirimi (deliveryTerm)", () => {
  it("satıcı-taşır (adrese teslim) → 'gönderildi' bildirimi", async () => {
    const orders = makeOrdersService();
    const { seller, buyer } = await twoParties();
    const order = await makeOrder(seller.company.id, buyer.company.id, {
      status: "ACCEPTED",
      deliveryTerm: "DOMESTIC_DELIVERED",
      acceptedAt: new Date(),
    });
    await orders.ship(seller.auth, order.id, { invoiceNumber: "F1" } as never);
    const n = await prisma.notification.count({
      where: { companyId: buyer.company.id, title: "Sipariş yolda" },
    });
    expect(n).toBe(1);
  });

  it("alıcı-toplar (EXW) → 'teslime hazır' bildirimi", async () => {
    const orders = makeOrdersService();
    const { seller, buyer } = await twoParties();
    const order = await makeOrder(seller.company.id, buyer.company.id, {
      status: "ACCEPTED",
      deliveryTerm: "EXW",
      acceptedAt: new Date(),
    });
    await orders.ship(seller.auth, order.id, { invoiceNumber: "F1" } as never);
    const hazir = await prisma.notification.count({
      where: { companyId: buyer.company.id, title: "Teslime hazır" },
    });
    expect(hazir).toBe(1);
    const gonderildi = await prisma.notification.count({
      where: { companyId: buyer.company.id, title: "Sipariş yolda" },
    });
    expect(gonderildi).toBe(0);
  });
});

describe("A1 — satıcı iptal talebi + DISPUTED", () => {
  const REASON = "fabrika yangını nedeniyle sevk edilemiyor";

  it("satıcı ACCEPTED'da talep açar (ACCEPTED kalır); PENDING/IN_DELIVERY'de açılamaz", async () => {
    const orders = makeOrdersService();
    const { seller, buyer } = await twoParties();
    const pend = await makeOrder(seller.company.id, buyer.company.id);
    await expect(
      orders.requestCancel(seller.auth, pend.id, REASON),
    ).rejects.toThrow();
    const acc = await makeOrder(seller.company.id, buyer.company.id, {
      status: "ACCEPTED",
      acceptedAt: new Date(),
    });
    await orders.requestCancel(seller.auth, acc.id, REASON);
    const db = await prisma.companyOrder.findUniqueOrThrow({
      where: { id: acc.id },
    });
    expect(db.status).toBe("ACCEPTED");
    expect(db.cancelRequestedAt).not.toBeNull();
    const shipped = await makeOrder(seller.company.id, buyer.company.id, {
      status: "IN_DELIVERY",
      acceptedAt: new Date(),
    });
    await expect(
      orders.requestCancel(seller.auth, shipped.id, REASON),
    ).rejects.toThrow();
  });

  it("alıcı onaylar → CANCELLED", async () => {
    const orders = makeOrdersService();
    const { seller, buyer } = await twoParties();
    const order = await makeOrder(seller.company.id, buyer.company.id, {
      status: "ACCEPTED",
      acceptedAt: new Date(),
    });
    await orders.requestCancel(seller.auth, order.id, REASON);
    await orders.approveCancelRequest(buyer.auth, order.id);
    const db = await prisma.companyOrder.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(db.status).toBe("CANCELLED");
    expect(db.cancelReason).toBe(REASON);
  });

  it("alıcı reddeder → DISPUTED (ACCEPTED'a dönmez)", async () => {
    const orders = makeOrdersService();
    const { seller, buyer } = await twoParties();
    const order = await makeOrder(seller.company.id, buyer.company.id, {
      status: "ACCEPTED",
      acceptedAt: new Date(),
    });
    await orders.requestCancel(seller.auth, order.id, REASON);
    await orders.rejectCancelRequest(buyer.auth, order.id, "mal teslim bekliyorum");
    const db = await prisma.companyOrder.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(db.status).toBe("DISPUTED");
    expect(db.disputedAt).not.toBeNull();
  });

  it("DISPUTED iki-yönlü çıkış: satıcı SEVK edebilir (→IN_DELIVERY)", async () => {
    const orders = makeOrdersService();
    const { seller, buyer } = await twoParties();
    const order = await makeOrder(seller.company.id, buyer.company.id, {
      status: "DISPUTED",
      acceptedAt: new Date(),
    });
    await orders.ship(seller.auth, order.id, { invoiceNumber: "F-1" } as never);
    const db = await prisma.companyOrder.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(db.status).toBe("IN_DELIVERY");
  });

  it("DISPUTED iki-yönlü çıkış: alıcı iptali ONAYLAYABİLİR (→CANCELLED)", async () => {
    const orders = makeOrdersService();
    const { seller, buyer } = await twoParties();
    const order = await makeOrder(seller.company.id, buyer.company.id, {
      status: "DISPUTED",
      acceptedAt: new Date(),
    });
    await orders.approveCancelRequest(buyer.auth, order.id);
    const db = await prisma.companyOrder.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(db.status).toBe("CANCELLED");
  });

  it("otomatik onay YOK — açık talep varken karar verilmezse ACCEPTED kalır", async () => {
    const orders = makeOrdersService();
    const { seller, buyer } = await twoParties();
    const order = await makeOrder(seller.company.id, buyer.company.id, {
      status: "ACCEPTED",
      acceptedAt: new Date(),
    });
    await orders.requestCancel(seller.auth, order.id, REASON);
    // karar yok — sipariş hâlâ ACCEPTED (satıcı talep açıp kaçamaz).
    const db = await prisma.companyOrder.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(db.status).toBe("ACCEPTED");
  });

  it("audit izi: cancel_requested + disputed", async () => {
    const orders = makeOrdersService();
    const { seller, buyer } = await twoParties();
    const order = await makeOrder(seller.company.id, buyer.company.id, {
      status: "ACCEPTED",
      acceptedAt: new Date(),
    });
    await orders.requestCancel(seller.auth, order.id, REASON);
    await orders.rejectCancelRequest(buyer.auth, order.id);
    const requested = await prisma.auditLog.count({
      where: { action: "company.order.cancel_requested", entityId: order.id },
    });
    const disputed = await prisma.auditLog.count({
      where: { action: "company.order.disputed", entityId: order.id },
    });
    expect(requested).toBe(1);
    expect(disputed).toBe(1);
  });
});

describe("S1 — accept banka hesabı LC/vesaikte opsiyonel", () => {
  it("akreditif siparişi banka hesabı SEÇMEDEN onaylanabilir", async () => {
    const orders = makeOrdersService();
    const { seller, buyer } = await twoParties();
    const order = await makeOrder(seller.company.id, buyer.company.id, {
      paymentCategory: "LETTER_OF_CREDIT",
      paymentTiming: "BEFORE_DELIVERY",
    });
    // bankAccountId YOK — LC'de ödeme banka kanalından → yine de ACCEPTED.
    await orders.accept(seller.auth, order.id, acceptInput as never);
    const db = await prisma.companyOrder.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(db.status).toBe("ACCEPTED");
    expect(db.bankIban).toBeNull();
  });

  it("normal (vadeli) siparişte banka hesabı hâlâ ZORUNLU", async () => {
    const orders = makeOrdersService();
    const { seller, buyer } = await twoParties();
    const order = await makeOrder(seller.company.id, buyer.company.id);
    await expect(
      orders.accept(seller.auth, order.id, acceptInput as never),
    ).rejects.toThrow(/banka hesabı/i);
  });
});

describe("mutlu yol — AFTER_DELIVERY (teslim sonrası ödeme)", () => {
  it("accept → ship → receive → tam ödeme onayı → oto-COMPLETED (damgalarla)", async () => {
    const orders = makeOrdersService();
    const { seller, buyer } = await twoParties();
    const order = await makeOrder(seller.company.id, buyer.company.id);

    await orders.accept(seller.auth, order.id, (await acceptInputFor(seller.company.id)) as never);
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

  it("oto-tamamlama bildirimi SATICIYA gider, alıcıya çift düşmez", async () => {
    const orders = makeOrdersService();
    const { seller, buyer } = await twoParties();
    const order = await makeOrder(seller.company.id, buyer.company.id);

    await orders.accept(seller.auth, order.id, (await acceptInputFor(seller.company.id)) as never);
    await orders.ship(seller.auth, order.id, { invoiceNumber: "FTR-1" } as never);
    await orders.receive(buyer.auth, order.id, {} as never);
    const payment = (await orders.recordPayment(buyer.auth, order.id, {
      amount: 1000,
      method: "EFT",
    } as never)) as { id: string };
    await orders.confirmPayment(seller.auth, order.id, payment.id);

    // "Sipariş tamamlandı" bildirimi siparişi oto-kapanan SATICIYA gitmeli.
    const sellerDone = await prisma.notification.count({
      where: { companyId: seller.company.id, title: "Sipariş tamamlandı" },
    });
    expect(sellerDone).toBeGreaterThan(0);
    // Alıcı tamamlanma bildirimini ALMAMALI (o "Ödeme onaylandı" aldı).
    const buyerDone = await prisma.notification.count({
      where: { companyId: buyer.company.id, title: "Sipariş tamamlandı" },
    });
    expect(buyerDone).toBe(0);
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

  it("C1: CAD (vesaik mukabili) ödenmeden teslim ALINAMAZ (diğer BEFORE_DELIVERY'nin aksine)", async () => {
    const orders = makeOrdersService();
    const { seller, buyer } = await twoParties();
    const order = await makeOrder(seller.company.id, buyer.company.id, {
      status: "IN_DELIVERY",
      paymentTiming: "BEFORE_DELIVERY",
      paymentCategory: "CASH_AGAINST_DOCS",
      acceptedAt: new Date(),
      deliveryStartedAt: new Date(),
    });
    // Kısmi-peşin/LC gibi diğer BEFORE_DELIVERY'de DELIVERED'a düşerdi; CAD'de
    // belge karşılığı ödeme şart → teslim alma tam ödeme onayı olmadan reddedilir.
    await expect(
      orders.receive(buyer.auth, order.id, {} as never),
    ).rejects.toThrow(/vesaik|tam ödeme/i);
    const db = await prisma.companyOrder.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(db.status).toBe("IN_DELIVERY"); // teslim alınmadı
  });

  it("C1: CAD tam ödeme ONAYLIYKEN teslim alma COMPLETED", async () => {
    const orders = makeOrdersService();
    const { seller, buyer } = await twoParties();
    const order = await makeOrder(seller.company.id, buyer.company.id, {
      status: "IN_DELIVERY",
      paymentTiming: "BEFORE_DELIVERY",
      paymentCategory: "CASH_AGAINST_DOCS",
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

describe("iptal kapısı — onaylı ödeme", () => {
  it("onaylı (CONFIRMED) ödeme varken alıcı siparişi iptal EDEMEZ", async () => {
    const orders = makeOrdersService();
    const { seller, buyer } = await twoParties();
    const order = await makeOrder(seller.company.id, buyer.company.id, {
      status: "ACCEPTED",
      paymentTiming: "BEFORE_DELIVERY",
      acceptedAt: new Date(),
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
    await expect(
      orders.cancel(buyer.auth, order.id, "İhtiyaç değişti, iptal ediyorum"),
    ).rejects.toThrow(/onaylı ödeme|iade/i);
    const db = await prisma.companyOrder.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(db.status).toBe("ACCEPTED"); // iptal edilmedi
  });

  it("onaylı ödeme yokken alıcı ACCEPTED siparişi iptal edebilir", async () => {
    const orders = makeOrdersService();
    const { seller, buyer } = await twoParties();
    const order = await makeOrder(seller.company.id, buyer.company.id, {
      status: "ACCEPTED",
      acceptedAt: new Date(),
    });
    const res = await orders.cancel(
      buyer.auth,
      order.id,
      "İhtiyaç değişti, iptal ediyorum",
    );
    expect(res.status).toBe("CANCELLED");
  });
});

describe("tamamlama kapısı — tam ödeme onayı", () => {
  const deliveredOrder = (sellerId: string, buyerId: string, amount = 1000) =>
    makeOrder(sellerId, buyerId, {
      status: "DELIVERED",
      amount,
      acceptedAt: new Date(),
      deliveryStartedAt: new Date(),
      deliveredAt: new Date(),
    });

  it("ödeme onaylı kayıt yokken alıcı siparişi TAMAMLAYAMAZ", async () => {
    const orders = makeOrdersService();
    const { seller, buyer } = await twoParties();
    const order = await deliveredOrder(seller.company.id, buyer.company.id);
    await expect(
      orders.complete(buyer.auth, order.id, {} as never),
    ).rejects.toThrow(/tamamlanamaz/i);
    const db = await prisma.companyOrder.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(db.status).toBe("DELIVERED");
  });

  it("kısmi onaylı ödeme yetmez — tamamlanamaz", async () => {
    const orders = makeOrdersService();
    const { seller, buyer } = await twoParties();
    const order = await deliveredOrder(seller.company.id, buyer.company.id, 1000);
    await prisma.companyOrderPayment.create({
      data: {
        orderId: order.id,
        amount: 400,
        status: "CONFIRMED",
        recordedByCompanyId: buyer.company.id,
        confirmedAt: new Date(),
      },
    });
    await expect(
      orders.complete(buyer.auth, order.id, {} as never),
    ).rejects.toThrow(/tamamlanamaz/i);
  });

  it("tam onaylı ödemeyle tamamlanır", async () => {
    const orders = makeOrdersService();
    const { seller, buyer } = await twoParties();
    const order = await deliveredOrder(seller.company.id, buyer.company.id, 1000);
    await prisma.companyOrderPayment.create({
      data: {
        orderId: order.id,
        amount: 1000,
        status: "CONFIRMED",
        recordedByCompanyId: buyer.company.id,
        confirmedAt: new Date(),
      },
    });
    const res = await orders.complete(buyer.auth, order.id, {} as never);
    expect(res.status).toBe("COMPLETED");
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
    await expect(
      orders.cancel(seller.auth, order.id, "vazgeçtik, gerek kalmadı"),
    ).rejects.toThrow(/yapamazsınız/);
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

    await orders.accept(seller.auth, order.id, (await acceptInputFor(seller.company.id)) as never);
    // ACCEPTED'da alıcı hâlâ iptal edebilir.
    // (ayrı siparişte doğrula — bu siparişi akışta tutuyoruz)
    await expect(
      orders.accept(seller.auth, order.id, acceptInput as never),
    ).rejects.toThrow(/uygun değil/); // çift accept

    await orders.ship(seller.auth, order.id, { invoiceNumber: "F-1" } as never);
    // Kargodayken alıcı iptal EDEMEZ (eski sistemden bilinçli fark).
    await expect(
      orders.cancel(buyer.auth, order.id, "vazgeçtik, gerek kalmadı"),
    ).rejects.toThrow(/uygun değil/);
  });

  it("iptal/ret gerekçesi zorunlu (≥10 karakter) — sunucu tarafında", async () => {
    const orders = makeOrdersService();
    const { seller, buyer } = await twoParties();
    const order = await makeOrder(seller.company.id, buyer.company.id);
    await expect(orders.cancel(buyer.auth, order.id)).rejects.toThrow(
      /en az 10 karakter/,
    );
    await expect(orders.cancel(buyer.auth, order.id, "kısa")).rejects.toThrow(
      /en az 10 karakter/,
    );
    await expect(orders.reject(seller.auth, order.id, "yok")).rejects.toThrow(
      /en az 10 karakter/,
    );
  });

  it("rol kapısı: Satışçı rolü olmayan satıcı kullanıcısı onaylayamaz; Satın Almacı olmayan alıcı teslim alamaz", async () => {
    const orders = makeOrdersService();
    // Satıcı firmada YALNIZ satın-almacı rollü kullanıcı; alıcıda yalnız satışçı.
    const seller = await makeCompanyWithUser(prisma, {
      country: "TR",
      roles: ["SATIN_ALMACI"] as never,
    });
    const buyer = await makeCompanyWithUser(prisma, {
      country: "TR",
      roles: ["SATISCI"] as never,
    });
    const order = await makeOrder(seller.company.id, buyer.company.id, {
      status: "IN_DELIVERY",
      acceptedAt: new Date(),
      deliveryStartedAt: new Date(),
    });

    await expect(
      orders.accept(seller.auth, order.id, acceptInput as never),
    ).rejects.toThrow(/Satışçı rolü/);
    await expect(
      orders.receive(buyer.auth, order.id, {} as never),
    ).rejects.toThrow(/Satın Almacı rolü/);
    await expect(
      orders.recordPayment(buyer.auth, order.id, { amount: 100 } as never),
    ).rejects.toThrow(/Satın Almacı rolü/);
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

describe("teminat mektubu — ilan sahibinin seçimi (requireGuaranteeLetter)", () => {
  it("teminat şartlı sipariş, teminat belgesi yüklenmeden onaylanamaz", async () => {
    const orders = makeOrdersService();
    const { seller, buyer } = await twoParties();
    const order = await makeOrder(seller.company.id, buyer.company.id, {
      paymentTiming: "BEFORE_DELIVERY",
      requireGuaranteeLetter: true,
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
    const res = await orders.accept(seller.auth, order.id, (await acceptInputFor(seller.company.id)) as never);
    expect(res.status).toBe("ACCEPTED");
  });

  it("teslim ÖNCESİ ödeme ama şart İŞARETLENMEMİŞ → teminatsız onay geçer (opsiyonel özellik)", async () => {
    const orders = makeOrdersService();
    const { seller, buyer } = await twoParties();
    const order = await makeOrder(seller.company.id, buyer.company.id, {
      paymentTiming: "BEFORE_DELIVERY",
      requireGuaranteeLetter: false,
    });
    const res = await orders.accept(
      seller.auth,
      order.id,
      (await acceptInputFor(seller.company.id)) as never,
    );
    expect(res.status).toBe("ACCEPTED");
  });

  it("teslim SONRASI ödemede (COD/vadeli) teminat istenmez — peşin olsa bile", async () => {
    const orders = makeOrdersService();
    const { seller, buyer } = await twoParties();
    // Açık hesap (teslim sonrası) ilan → alıcı riskte değil, teminat yok.
    const listing = await makeListing(prisma, {
      companyId: buyer.company.id,
      createdById: buyer.user.id,
      type: "ALIM",
      status: "AWARDED",
      paymentCategory: "OPEN_ACCOUNT",
    });
    const order = await makeOrder(seller.company.id, buyer.company.id, {
      listingId: listing.id,
      paymentTiming: "AFTER_DELIVERY",
    });
    const res = await orders.accept(seller.auth, order.id, (await acceptInputFor(seller.company.id)) as never);
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

  it("kısmi ödeme tamamlamaya yetmez; kalan onaylanınca sipariş tamamlanır", async () => {
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
    // Kısmi (400/1000) onaylı → tamamlanamaz.
    await expect(
      orders.complete(buyer.auth, order.id, {} as never),
    ).rejects.toThrow(/tamamlanamaz/i);

    // Kalan ödenip satıcı onaylayınca sipariş OTOMATİK tamamlanır.
    const p2 = (await orders.recordPayment(buyer.auth, order.id, {
      amount: 600,
    } as never)) as { id: string };
    await orders.confirmPayment(seller.auth, order.id, p2.id);
    const db = await prisma.companyOrder.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(db.status).toBe("COMPLETED");
    const totals = await orders.getOne(buyer.auth, order.id);
    expect(Number(totals.paymentTotals.confirmed)).toBe(1000);
    expect(Number(totals.paymentTotals.remaining)).toBe(0);
  });
});

describe("sıfır-tutarlı sipariş — tamamlanabilir", () => {
  it("amount=0 sipariş, ödeme beklenmeden COMPLETED olabilir", async () => {
    const orders = makeOrdersService();
    const { seller, buyer } = await twoParties();
    const order = await makeOrder(seller.company.id, buyer.company.id, {
      status: "DELIVERED",
      amount: 0,
      deliveredAt: new Date(),
    });
    const res = await orders.complete(buyer.auth, order.id, {} as never);
    expect(res.status).toBe("COMPLETED"); // total<=0 → ödenecek yok = tam ödenmiş
  });
});

describe("iptal edilmiş siparişte asılı ödeme", () => {
  it("CANCELLED sipariş + AWAITING ödeme → satıcı CONFIRM edemez ama REDDEDEBİLİR", async () => {
    const orders = makeOrdersService();
    const { seller, buyer } = await twoParties();
    const order = await makeOrder(seller.company.id, buyer.company.id, {
      status: "CANCELLED",
      cancelledAt: new Date(),
      cancelReason: "test iptal gerekçesi",
    });
    const payment = await prisma.companyOrderPayment.create({
      data: {
        orderId: order.id,
        amount: 1000,
        status: "AWAITING_CONFIRMATION",
        recordedByCompanyId: buyer.company.id,
      },
    });
    // CONFIRM edilemez (iptal edilmiş siparişte onaylı para oluşmaz).
    await expect(
      orders.confirmPayment(seller.auth, order.id, payment.id),
    ).rejects.toThrow(/onaylanamaz/i);
    // Ama REDDEDİLEBİLİR — asılı AWAITING kaydı sonuçlandırılabilsin.
    await orders.rejectPayment(
      seller.auth,
      order.id,
      payment.id,
      "sipariş iptal edildi",
    );
    const db = await prisma.companyOrderPayment.findUniqueOrThrow({
      where: { id: payment.id },
    });
    expect(db.status).toBe("REJECTED");
  });
});

describe("Faz 3 — gönderim kilidi (S3: peşin eşiği)", () => {
  it("peşin şartlı siparişte eşik onaylanmadan GÖNDERİLEMEZ; onaylanınca gönderilir", async () => {
    const orders = makeOrdersService();
    const { seller, buyer } = await twoParties();
    // Kısmi peşin %50 → eşik 500. Sipariş tutarı 1000.
    const order = await makeOrder(seller.company.id, buyer.company.id, {
      status: "ACCEPTED",
      paymentTiming: "BEFORE_DELIVERY",
      paymentCategory: "ADVANCE",
      advancePercent: 50,
      acceptedAt: new Date(),
    });
    // Ödeme yokken gönderim reddedilir.
    await expect(
      orders.ship(seller.auth, order.id, { invoiceNumber: "F1" } as never),
    ).rejects.toThrow(/peşin/i);

    // 500 onaylı ödeme → eşik karşılanır, gönderilebilir.
    await prisma.companyOrderPayment.create({
      data: {
        orderId: order.id,
        amount: 500,
        status: "CONFIRMED",
        recordedByCompanyId: buyer.company.id,
        confirmedAt: new Date(),
      },
    });
    const res = await orders.ship(seller.auth, order.id, {
      invoiceNumber: "F1",
    } as never);
    expect(res.status).toBe("IN_DELIVERY");
  });

  it("tam peşin (%100) siparişte eşik = tam tutar", async () => {
    const orders = makeOrdersService();
    const { seller, buyer } = await twoParties();
    const order = await makeOrder(seller.company.id, buyer.company.id, {
      status: "ACCEPTED",
      paymentTiming: "BEFORE_DELIVERY",
      paymentCategory: "ADVANCE",
      advancePercent: 100,
      acceptedAt: new Date(),
    });
    // 500 (yarısı) yetmez.
    await prisma.companyOrderPayment.create({
      data: {
        orderId: order.id,
        amount: 500,
        status: "CONFIRMED",
        recordedByCompanyId: buyer.company.id,
        confirmedAt: new Date(),
      },
    });
    await expect(
      orders.ship(seller.auth, order.id, { invoiceNumber: "F1" } as never),
    ).rejects.toThrow(/peşin/i);
  });

  it("açık hesap/vadeli siparişte peşin şartı YOK — doğrudan gönderilir", async () => {
    const orders = makeOrdersService();
    const { seller, buyer } = await twoParties();
    const order = await makeOrder(seller.company.id, buyer.company.id, {
      status: "ACCEPTED",
      paymentTiming: "AFTER_DELIVERY",
      paymentCategory: "OPEN_ACCOUNT",
      acceptedAt: new Date(),
    });
    const res = await orders.ship(seller.auth, order.id, {
      invoiceNumber: "F1",
    } as never);
    expect(res.status).toBe("IN_DELIVERY");
  });
});

describe("Faz 3 — akreditif adım seti (S5)", () => {
  async function lcOrder(sellerId: string, buyerId: string) {
    return makeOrder(sellerId, buyerId, {
      status: "ACCEPTED",
      paymentTiming: "BEFORE_DELIVERY",
      paymentCategory: "LETTER_OF_CREDIT",
      lcType: "SIGHT",
      acceptedAt: new Date(),
    });
  }

  it("uçtan uca: LC belgesi → açıldı → kabul → gönder → banka ödedi → tamamlandı", async () => {
    const orders = makeOrdersService();
    const { seller, buyer } = await twoParties();
    const order = await lcOrder(seller.company.id, buyer.company.id);

    // Belge yokken "Akreditif Açıldı" reddedilir.
    await expect(orders.lcMarkOpened(buyer.auth, order.id)).rejects.toThrow(
      /belge/i,
    );
    // LC belgesi ekle → açıldı.
    await prisma.companyOrderDocument.create({
      data: {
        orderId: order.id,
        type: "LC",
        key: `company-orders/${order.id}/lc/x.pdf`,
        fileName: "kusat.pdf",
        mimeType: "application/pdf",
        uploadedByCompanyId: buyer.company.id,
      },
    });
    await orders.lcMarkOpened(buyer.auth, order.id);

    // Kabul edilmeden gönderilemez.
    await expect(
      orders.ship(seller.auth, order.id, { invoiceNumber: "F1" } as never),
    ).rejects.toThrow(/kabul/i);

    await orders.lcMarkAccepted(seller.auth, order.id);
    // Kabulden sonra gönderilebilir.
    await orders.ship(seller.auth, order.id, { invoiceNumber: "F1" } as never);
    await orders.receive(buyer.auth, order.id, {} as never); // DELIVERED (ödeme yok)

    let db = await prisma.companyOrder.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(db.status).toBe("DELIVERED");

    // Banka ödedi → sistem onaylı tam-tutar kaydı + oto-tamamlama.
    const res = await orders.lcMarkPaid(seller.auth, order.id);
    expect(res.completed).toBe(true);
    db = await prisma.companyOrder.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(db.status).toBe("COMPLETED");
    expect(db.lcPaidAt).not.toBeNull();
    const pay = await prisma.companyOrderPayment.findFirstOrThrow({
      where: { orderId: order.id },
    });
    expect(pay.status).toBe("CONFIRMED");
    expect(Number(pay.amount)).toBe(1000);
    expect(pay.method).toBe("Akreditif");
  });

  it("LC'de alıcının manuel ödeme kaydı REDDEDİLİR (banka kanalı)", async () => {
    const orders = makeOrdersService();
    const { seller, buyer } = await twoParties();
    const order = await lcOrder(seller.company.id, buyer.company.id);
    await expect(
      orders.recordPayment(buyer.auth, order.id, { amount: 100 } as never),
    ).rejects.toThrow(/banka/i);
  });

  it("lcMarkPaid onaylı kısmi tutarda yalnız KALANI yazar (birleşik toplam, cap'li — fazla-tahsilat yok)", async () => {
    const orders = makeOrdersService();
    const { seller, buyer } = await twoParties();
    const order = await makeOrder(seller.company.id, buyer.company.id, {
      status: "DELIVERED",
      paymentTiming: "BEFORE_DELIVERY",
      paymentCategory: "LETTER_OF_CREDIT",
      lcType: "SIGHT",
      amount: 1000,
      acceptedAt: new Date(),
      lcOpenedAt: new Date(),
      lcAcceptedAt: new Date(),
      deliveryStartedAt: new Date(),
      deliveredAt: new Date(),
    });
    // Kısmi onaylı ödeme — senaryo yapay (LC'de manuel ödeme reddedilir), yalnız
    // lcMarkPaid'in birleşik confirmedPaymentSum ile "kalanı" hesapladığını
    // doğrulamak için doğrudan seed.
    await prisma.companyOrderPayment.create({
      data: {
        orderId: order.id,
        amount: 400,
        status: "CONFIRMED",
        recordedByCompanyId: buyer.company.id,
        confirmedAt: new Date(),
      },
    });

    const res = await orders.lcMarkPaid(seller.auth, order.id);
    expect(res.completed).toBe(true);

    // Banka ödemesi yalnız kalanı (600) yazdı — tam tutarı (1000) DEĞİL.
    const lcPayment = await prisma.companyOrderPayment.findFirstOrThrow({
      where: { orderId: order.id, method: "Akreditif" },
    });
    expect(Number(lcPayment.amount)).toBe(600);
    // Toplam onaylı = tam tutar; fazla-tahsilat yok.
    const agg = await prisma.companyOrderPayment.aggregate({
      where: { orderId: order.id, status: "CONFIRMED" },
      _sum: { amount: true },
    });
    expect(Number(agg._sum.amount)).toBe(1000);
  });

  it("LC olmayan siparişte lc adımları reddedilir", async () => {
    const orders = makeOrdersService();
    const { seller, buyer } = await twoParties();
    const order = await makeOrder(seller.company.id, buyer.company.id, {
      status: "ACCEPTED",
      paymentCategory: "OPEN_ACCOUNT",
      acceptedAt: new Date(),
    });
    await expect(orders.lcMarkOpened(buyer.auth, order.id)).rejects.toThrow(
      /akreditifli değil/i,
    );
  });
});

describe("Faz 3 — vade hatırlatması (S7)", () => {
  it("vadesi yaklaşan, teslim alınmış, ödenmemiş siparişte alıcıya bir kez bildirim", async () => {
    const orders = makeOrdersService();
    const { seller, buyer } = await twoParties();
    // Teslim 29 gün önce, 30 gün vade → vade yarın (≤3 gün).
    const order = await makeOrder(seller.company.id, buyer.company.id, {
      status: "DELIVERED",
      paymentCategory: "DEFERRED",
      paymentDays: 30,
      deliveredAt: new Date(Date.now() - 29 * 86_400_000),
      deliveryStartedAt: new Date(Date.now() - 30 * 86_400_000),
      acceptedAt: new Date(Date.now() - 31 * 86_400_000),
    });
    const sent = await orders.sendDuePaymentReminders();
    expect(sent).toBe(1);
    const n = await prisma.notification.count({
      where: { companyId: buyer.company.id, title: "Ödeme vadesi yaklaşıyor" },
    });
    expect(n).toBe(1);
    // İkinci çağrı idempotent — tekrar göndermez.
    const again = await orders.sendDuePaymentReminders();
    expect(again).toBe(0);
  });

  it("vadesi uzak sipariş hatırlatılmaz", async () => {
    const orders = makeOrdersService();
    const { seller, buyer } = await twoParties();
    const order = await makeOrder(seller.company.id, buyer.company.id, {
      status: "DELIVERED",
      paymentCategory: "DEFERRED",
      paymentDays: 60,
      deliveredAt: new Date(), // vade 60 gün sonra
    });
    void order;
    const sent = await orders.sendDuePaymentReminders();
    expect(sent).toBe(0);
  });

  it("çok sayıda aday: vadesi gelen+ödenmemiş hatırlatılır, tam ödenmiş ve vadesi uzak atlanır (groupBy + batch)", async () => {
    const orders = makeOrdersService();
    const { seller, buyer } = await twoParties();
    const dueBase = {
      status: "DELIVERED" as const,
      paymentCategory: "DEFERRED" as const,
      paymentDays: 30,
      deliveredAt: new Date(Date.now() - 29 * 86_400_000), // vade yarın
      deliveryStartedAt: new Date(Date.now() - 30 * 86_400_000),
      acceptedAt: new Date(Date.now() - 31 * 86_400_000),
    };
    // (1) vadesi gelen, ödenmemiş → hatırlatılır.
    const unpaid = await makeOrder(seller.company.id, buyer.company.id, {
      ...dueBase,
      amount: 1000,
    });
    // (2) vadesi gelen ama TAM ödenmiş → atlanır (groupBy toplamı = tutar).
    const paid = await makeOrder(seller.company.id, buyer.company.id, {
      ...dueBase,
      amount: 1000,
    });
    await prisma.companyOrderPayment.create({
      data: {
        orderId: paid.id,
        amount: 1000,
        status: "CONFIRMED",
        recordedByCompanyId: buyer.company.id,
        confirmedAt: new Date(),
      },
    });
    // (3) vadesi uzak → atlanır.
    await makeOrder(seller.company.id, buyer.company.id, {
      status: "DELIVERED",
      paymentCategory: "DEFERRED",
      paymentDays: 90,
      deliveredAt: new Date(),
    });

    const sent = await orders.sendDuePaymentReminders();
    expect(sent).toBe(1); // yalnız (1)

    // Yalnız ödenmemiş sipariş damgalandı; tam ödenmiş damgasız kaldı.
    const unpaidRow = await prisma.companyOrder.findUniqueOrThrow({
      where: { id: unpaid.id },
    });
    const paidRow = await prisma.companyOrder.findUniqueOrThrow({
      where: { id: paid.id },
    });
    expect(unpaidRow.paymentDueReminderSentAt).not.toBeNull();
    expect(paidRow.paymentDueReminderSentAt).toBeNull();

    // İkinci çağrı idempotent.
    expect(await orders.sendDuePaymentReminders()).toBe(0);
  });
});

describe("Faz 5 — sipariş revizyon müzakeresi", () => {
  async function acceptedOrderWithItems() {
    const { seller, buyer } = await twoParties();
    const order = await makeOrder(seller.company.id, buyer.company.id, {
      status: "ACCEPTED",
      amount: 1000,
      acceptedAt: new Date(),
      items: {
        create: [
          { name: "Çelik", quantity: 10, unit: "ton", unitPrice: 100 },
        ],
      },
    });
    return { seller, buyer, order };
  }
  const revItems = [
    { name: "Çelik", quantity: 8, unit: "ton", unitPrice: 120 }, // 960
    { name: "Nakliye", quantity: 1, unit: "sefer", unitPrice: 200 }, // 200
  ];

  it("SINIF-A guard: revizyon TOPLAMI MAX_MONEY'i aşınca 400 (Postgres 500 DEĞİL) — toplamsal", async () => {
    const orders = makeOrdersService();
    const { seller, order } = await acceptedOrderWithItems();
    // İki kalem: her biri tek başına ≤ MAX_MONEY (DTO @Max geçer) ama TOPLAM
    // > MAX_MONEY → yalnız servis guard'ı yakalar (per-alan @Max yetmez).
    await expect(
      orders.proposeRevision(seller.auth, order.id, {
        items: [
          { name: "A", quantity: 1, unit: "ad", unitPrice: MAX_MONEY },
          { name: "B", quantity: 1, unit: "ad", unitPrice: MAX_MONEY },
        ],
      } as never),
    ).rejects.toThrow(/çok büyük/);
  });

  it("SINIF-A guard: tam-sınır (toplam = MAX_MONEY) KABUL edilir", async () => {
    const orders = makeOrdersService();
    const { seller, order } = await acceptedOrderWithItems();
    const prop = await orders.proposeRevision(seller.auth, order.id, {
      items: [{ name: "A", quantity: 1, unit: "ad", unitPrice: MAX_MONEY }],
    } as never);
    expect(prop).toBeDefined();
  });

  it("revizyon kalem notu + teslim tarihi öneriden onaya KORUNUR (kayıp bug regresyonu)", async () => {
    const orders = makeOrdersService();
    const { seller, buyer, order } = await acceptedOrderWithItems();
    const itemDate = future(15).toISOString();
    const prop = (await orders.proposeRevision(seller.auth, order.id, {
      items: [
        {
          name: "Çelik",
          quantity: 8,
          unit: "ton",
          unitPrice: 120,
          deliveryDate: itemDate,
          note: "galvanizli",
        },
      ],
    } as never)) as { revisionId: string };
    await orders.approveRevision(buyer.auth, order.id, prop.revisionId);
    const items = await prisma.companyOrderItem.findMany({
      where: { orderId: order.id },
    });
    expect(items).toHaveLength(1);
    expect(items[0]!.note).toBe("galvanizli");
    expect(items[0]!.deliveryDate).not.toBeNull();
  });

  it("satıcı öner → alıcı onayla: kalemler değişir, tutar (1160) + teslim güncellenir", async () => {
    const orders = makeOrdersService();
    const { seller, buyer, order } = await acceptedOrderWithItems();
    const newDelivery = future(20).toISOString();

    const prop = (await orders.proposeRevision(seller.auth, order.id, {
      items: revItems,
      expectedDeliveryDate: newDelivery,
      note: "Fiyat güncellendi + nakliye eklendi",
    } as never)) as { revisionId: string };

    await orders.approveRevision(buyer.auth, order.id, prop.revisionId);

    const db = await prisma.companyOrder.findUniqueOrThrow({
      where: { id: order.id },
      include: { items: true, revisions: true },
    });
    expect(Number(db.amount)).toBe(1160);
    expect(db.items).toHaveLength(2);
    expect(db.items.map((i) => i.name).sort()).toEqual(["Nakliye", "Çelik"]);
    expect(db.expectedDeliveryDate).not.toBeNull();
    expect(db.revisions[0]!.status).toBe("APPROVED");
    expect(db.status).toBe("ACCEPTED"); // sipariş durumu değişmez
  });

  it("alıcı reddederse sipariş değişmez, revizyon REJECTED", async () => {
    const orders = makeOrdersService();
    const { seller, buyer, order } = await acceptedOrderWithItems();
    const prop = (await orders.proposeRevision(seller.auth, order.id, {
      items: revItems,
    } as never)) as { revisionId: string };
    await orders.rejectRevision(
      buyer.auth,
      order.id,
      prop.revisionId,
      "Fiyat artışını kabul etmiyoruz",
    );
    const db = await prisma.companyOrder.findUniqueOrThrow({
      where: { id: order.id },
      include: { items: true, revisions: true },
    });
    expect(Number(db.amount)).toBe(1000); // değişmedi
    expect(db.items).toHaveLength(1);
    expect(db.revisions[0]!.status).toBe("REJECTED");
  });

  it("satıcı önerdiği revizyonu geri çekebilir (CANCELLED)", async () => {
    const orders = makeOrdersService();
    const { seller, buyer, order } = await acceptedOrderWithItems();
    const prop = (await orders.proposeRevision(seller.auth, order.id, {
      items: revItems,
    } as never)) as { revisionId: string };
    await orders.cancelRevision(seller.auth, order.id, prop.revisionId);
    const rev = await prisma.orderRevision.findUniqueOrThrow({
      where: { id: prop.revisionId },
    });
    expect(rev.status).toBe("CANCELLED");
    void buyer;
  });

  it("guard: ACCEPTED dışında öneri reddedilir", async () => {
    const orders = makeOrdersService();
    const { seller, buyer } = await twoParties();
    const order = await makeOrder(seller.company.id, buyer.company.id, {
      status: "IN_DELIVERY",
      acceptedAt: new Date(),
      deliveryStartedAt: new Date(),
    });
    await expect(
      orders.proposeRevision(seller.auth, order.id, {
        items: revItems,
      } as never),
    ).rejects.toThrow(/onaylanmış/i);
  });

  it("guard: ödeme kaydı varken öneri reddedilir", async () => {
    const orders = makeOrdersService();
    const { seller, buyer, order } = await acceptedOrderWithItems();
    await prisma.companyOrderPayment.create({
      data: {
        orderId: order.id,
        amount: 500,
        status: "CONFIRMED",
        recordedByCompanyId: buyer.company.id,
        confirmedAt: new Date(),
      },
    });
    await expect(
      orders.proposeRevision(seller.auth, order.id, {
        items: revItems,
      } as never),
    ).rejects.toThrow(/ödeme kaydı/i);
  });

  it("guard: aynı anda ikinci açık revizyon reddedilir", async () => {
    const orders = makeOrdersService();
    const { seller, order } = await acceptedOrderWithItems();
    await orders.proposeRevision(seller.auth, order.id, {
      items: revItems,
    } as never);
    await expect(
      orders.proposeRevision(seller.auth, order.id, {
        items: revItems,
      } as never),
    ).rejects.toThrow(/bekleyen bir revizyon/i);
  });

  it("guard: alıcı öneremez, satıcı onaylayamaz (yetki)", async () => {
    const orders = makeOrdersService();
    const { seller, buyer, order } = await acceptedOrderWithItems();
    await expect(
      orders.proposeRevision(buyer.auth, order.id, {
        items: revItems,
      } as never),
    ).rejects.toThrow(/yalnızca satıcı/i);
    const prop = (await orders.proposeRevision(seller.auth, order.id, {
      items: revItems,
    } as never)) as { revisionId: string };
    await expect(
      orders.approveRevision(seller.auth, order.id, prop.revisionId),
    ).rejects.toThrow(/yalnızca alıcı/i);
  });
});

describe("INV-MONEY-1 — Decimal sınır (epsilon YOK)", () => {
  it("tamamlama: tam-eşit onaylı ödeme GEÇER; 1 kuruş eksik GEÇMEZ", async () => {
    const orders = makeOrdersService();
    const { seller, buyer } = await twoParties();
    // 1 kuruş EKSİK → tamamlanamaz (eski 0.01 epsilon'u tam-sayardı = bug).
    const short = await makeOrder(seller.company.id, buyer.company.id, {
      status: "DELIVERED",
      amount: 1000,
      deliveredAt: new Date(),
    });
    await prisma.companyOrderPayment.create({
      data: {
        orderId: short.id,
        amount: 999.99,
        status: "CONFIRMED",
        recordedByCompanyId: buyer.company.id,
        confirmedAt: new Date(),
      },
    });
    await expect(
      orders.complete(buyer.auth, short.id, {} as never),
    ).rejects.toThrow(/tamamlanamaz/i);
    // TAM eşit → tamamlanır.
    const exact = await makeOrder(seller.company.id, buyer.company.id, {
      status: "DELIVERED",
      amount: 1000,
      deliveredAt: new Date(),
    });
    await prisma.companyOrderPayment.create({
      data: {
        orderId: exact.id,
        amount: 1000,
        status: "CONFIRMED",
        recordedByCompanyId: buyer.company.id,
        confirmedAt: new Date(),
      },
    });
    const res = await orders.complete(buyer.auth, exact.id, {} as never);
    expect(res.status).toBe("COMPLETED");
  });

  it("cap: cap'e tam ulaşan ödeme KABUL; cap'i 1 kuruş aşan REDDEDİLİR", async () => {
    const orders = makeOrdersService();
    const { seller, buyer } = await twoParties();
    const order = await makeOrder(seller.company.id, buyer.company.id, {
      status: "DELIVERED",
      amount: 1000,
      deliveredAt: new Date(),
    });
    // 999.99 kaydet (kalan 0.01).
    await orders.recordPayment(buyer.auth, order.id, { amount: 999.99 } as never);
    // +0.02 → toplam 1000.01 > cap → REDDEDİLİR.
    await expect(
      orders.recordPayment(buyer.auth, order.id, { amount: 0.02 } as never),
    ).rejects.toThrow(/aşan ödeme/i);
    // +0.01 → toplam 1000.00 = cap → KABUL (tam ulaşma geçer).
    await expect(
      orders.recordPayment(buyer.auth, order.id, { amount: 0.01 } as never),
    ).resolves.toBeDefined();
  });

  it("peşin eşiği: eşiğe tam ulaşan gönderilir; 1 kuruş eksik gönderilemez", async () => {
    const orders = makeOrdersService();
    const { seller, buyer } = await twoParties();
    // Tam peşin (%100), tutar 1000 → eşik 1000.
    const order = await makeOrder(seller.company.id, buyer.company.id, {
      status: "ACCEPTED",
      paymentTiming: "BEFORE_DELIVERY",
      paymentCategory: "ADVANCE",
      advancePercent: 100,
      amount: 1000,
      acceptedAt: new Date(),
    });
    await prisma.companyOrderPayment.create({
      data: {
        orderId: order.id,
        amount: 999.99,
        status: "CONFIRMED",
        recordedByCompanyId: buyer.company.id,
        confirmedAt: new Date(),
      },
    });
    // 1 kuruş eksik → gönderilemez.
    await expect(
      orders.ship(seller.auth, order.id, { invoiceNumber: "F1" } as never),
    ).rejects.toThrow(/peşin/i);
    // +0.01 → tam eşik → gönderilebilir.
    await prisma.companyOrderPayment.create({
      data: {
        orderId: order.id,
        amount: 0.01,
        status: "CONFIRMED",
        recordedByCompanyId: buyer.company.id,
        confirmedAt: new Date(),
      },
    });
    const res = await orders.ship(seller.auth, order.id, {
      invoiceNumber: "F1",
    } as never);
    expect(res.status).toBe("IN_DELIVERY");
  });
});
