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
  const email = { send: jest.fn().mockResolvedValue({ emailLogId: "test", sent: true }) };
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

describe("TTK 23 — muayene/ayıp ihbarı (8 gün)", () => {
  const REASON = "teslim edilen mallar spesifikasyona uygun değil";

  it("DELIVERED'da ihbar → DISPUTED (disputePrevStatus=DELIVERED)", async () => {
    const orders = makeOrdersService();
    const { seller, buyer } = await twoParties();
    const order = await makeOrder(seller.company.id, buyer.company.id, {
      status: "DELIVERED",
      acceptedAt: future(-3),
      deliveredAt: future(-2),
    });
    await orders.raiseDefectNotice(buyer.auth, order.id, REASON);
    const db = await prisma.companyOrder.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(db.status).toBe("DISPUTED");
    expect(db.defectNotifiedAt).not.toBeNull();
    expect(db.disputePrevStatus).toBe("DELIVERED");
    expect(db.defectReason).toBe(REASON);
  });

  it("COMPLETED'da (BEFORE_DELIVERY oto-tamamlanmış) ihbar → DISPUTED; COMPLETED non-terminal", async () => {
    const orders = makeOrdersService();
    const { seller, buyer } = await twoParties();
    const order = await makeOrder(seller.company.id, buyer.company.id, {
      status: "COMPLETED",
      acceptedAt: future(-3),
      deliveredAt: future(-2),
      completedAt: future(-2),
    });
    await orders.raiseDefectNotice(buyer.auth, order.id, REASON);
    const db = await prisma.companyOrder.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(db.status).toBe("DISPUTED");
    expect(db.disputePrevStatus).toBe("COMPLETED");
  });

  it("8 gün geçince ihbar REDDEDİLİR (pencere kapalı)", async () => {
    const orders = makeOrdersService();
    const { seller, buyer } = await twoParties();
    const order = await makeOrder(seller.company.id, buyer.company.id, {
      status: "DELIVERED",
      acceptedAt: future(-10),
      deliveredAt: future(-9),
    });
    await expect(
      orders.raiseDefectNotice(buyer.auth, order.id, REASON),
    ).rejects.toThrow(/süre/i);
    // OTOMATİK KABUL YOK: süre dolsa da durum DEĞİŞMEZ (DELIVERED kalır).
    const db = await prisma.companyOrder.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(db.status).toBe("DELIVERED");
  });

  it("geri çek → önceki duruma döner (DELIVERED ve COMPLETED)", async () => {
    const orders = makeOrdersService();
    const { seller, buyer } = await twoParties();
    for (const prev of ["DELIVERED", "COMPLETED"] as const) {
      const order = await makeOrder(seller.company.id, buyer.company.id, {
        status: prev,
        acceptedAt: future(-3),
        deliveredAt: future(-2),
        ...(prev === "COMPLETED" ? { completedAt: future(-2) } : {}),
      });
      await orders.raiseDefectNotice(buyer.auth, order.id, REASON);
      await orders.withdrawDefectNotice(buyer.auth, order.id);
      const db = await prisma.companyOrder.findUniqueOrThrow({
        where: { id: order.id },
      });
      expect(db.status).toBe(prev);
      expect(db.defectNotifiedAt).toBeNull();
      expect(db.disputePrevStatus).toBeNull();
    }
  });

  it("ayıp-DISPUTED SEVK EDİLEMEZ ve A1 iptal-onayı ETKİLEMEZ", async () => {
    const orders = makeOrdersService();
    const { seller, buyer } = await twoParties();
    const order = await makeOrder(seller.company.id, buyer.company.id, {
      status: "DELIVERED",
      acceptedAt: future(-3),
      deliveredAt: future(-2),
    });
    await orders.raiseDefectNotice(buyer.auth, order.id, REASON);
    // Satıcı sevk edemez (mal zaten teslim).
    await expect(
      orders.ship(seller.auth, order.id, { invoiceNumber: "F-X" } as never),
    ).rejects.toThrow(/ayıp/i);
    // A1 iptal-onayı ayıp-DISPUTED'ı iptal edemez (defectNotifiedAt guard).
    await expect(
      orders.approveCancelRequest(buyer.auth, order.id),
    ).rejects.toThrow();
    const db = await prisma.companyOrder.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(db.status).toBe("DISPUTED");
  });

  it("audit izi: defect_notified", async () => {
    const orders = makeOrdersService();
    const { seller, buyer } = await twoParties();
    const order = await makeOrder(seller.company.id, buyer.company.id, {
      status: "DELIVERED",
      acceptedAt: future(-3),
      deliveredAt: future(-2),
    });
    await orders.raiseDefectNotice(buyer.auth, order.id, REASON);
    const n = await prisma.auditLog.count({
      where: { action: "company.order.defect_notified", entityId: order.id },
    });
    expect(n).toBe(1);
  });
});

describe("MAL_MUKABILI — ödeme penceresi teslim SONRASI (AFTER_DELIVERY)", () => {
  it("ACCEPTED'da recordPayment REDDEDİLİR; accept→ship→receive(oto-COMPLETED) sonrası KABUL", async () => {
    const orders = makeOrdersService();
    const { seller, buyer } = await twoParties();
    const order = await makeOrder(seller.company.id, buyer.company.id, {
      status: "ACCEPTED",
      acceptedAt: new Date(),
      paymentTiming: "AFTER_DELIVERY",
      paymentCategory: "MAL_MUKABILI",
      amount: 1000,
    });
    // ACCEPTED: teslim sonrası ödeme penceresi HENÜZ kapalı → reddedilir.
    await expect(
      orders.recordPayment(buyer.auth, order.id, {
        amount: 1000,
        method: "EFT",
      } as never),
    ).rejects.toThrow();
    // Sevk + teslim (mal mukabili: teslim alınca öde) → madde 17: teslim
    // alma siparişi OTOMATİK tamamlar; ödeme penceresi COMPLETED'da açık.
    await orders.ship(seller.auth, order.id, { invoiceNumber: "F-MM" } as never);
    const rec = await orders.receive(buyer.auth, order.id, {} as never);
    expect(rec.status).toBe("COMPLETED");
    // COMPLETED: AFTER_DELIVERY penceresi açık → ödeme kabul.
    const p = (await orders.recordPayment(buyer.auth, order.id, {
      amount: 1000,
      method: "EFT",
    } as never)) as { id: string };
    expect(p.id).toBeTruthy();
  });
});

describe("ADVANCE %30 + 60 gün vade — ship-gate ∩ vade cron", () => {
  it("(a) peşin (300) tahsil+onay edilmeden ship REDDEDİLİR; edilince açılır → IN_DELIVERY", async () => {
    const orders = makeOrdersService();
    const { seller, buyer } = await twoParties();
    const order = await makeOrder(seller.company.id, buyer.company.id, {
      status: "ACCEPTED",
      acceptedAt: new Date(),
      paymentTiming: "BEFORE_DELIVERY",
      paymentCategory: "ADVANCE",
      advancePercent: 30,
      paymentDays: 60,
      amount: 1000,
    });
    // Peşin (1000×%30 = 300) onaylanmadan sevk edilemez.
    await expect(
      orders.ship(seller.auth, order.id, { invoiceNumber: "F-A" } as never),
    ).rejects.toThrow(/peşin/i);
    const p = (await orders.recordPayment(buyer.auth, order.id, {
      amount: 300,
      method: "EFT",
    } as never)) as { id: string };
    await orders.confirmPayment(seller.auth, order.id, p.id);
    await orders.ship(seller.auth, order.id, { invoiceNumber: "F-A" } as never);
    const db = await prisma.companyOrder.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(db.status).toBe("IN_DELIVERY");
  });

  it("(b) DELIVERED + deliveredAt 58 gün önce + onaylı 300 → cron kalan 700 için vade bildirimi üretir", async () => {
    const orders = makeOrdersService();
    const { seller, buyer } = await twoParties();
    const order = await makeOrder(seller.company.id, buyer.company.id, {
      status: "DELIVERED",
      acceptedAt: future(-60),
      deliveryStartedAt: future(-59),
      // vade = deliveredAt + 60 = -58 + 60 = +2 gün → 3-günlük ufuk içinde.
      deliveredAt: future(-58),
      paymentTiming: "BEFORE_DELIVERY",
      paymentCategory: "ADVANCE",
      advancePercent: 30,
      paymentDays: 60,
      amount: 1000,
    });
    // Onaylı peşin 300 → kalan 700 (tam ödenmemiş).
    await prisma.companyOrderPayment.create({
      data: {
        orderId: order.id,
        amount: 300,
        status: "CONFIRMED",
        recordedByCompanyId: buyer.company.id,
        confirmedAt: new Date(),
      },
    });
    const sent = await orders.sendDuePaymentReminders();
    expect(sent).toBeGreaterThanOrEqual(1);
    const n = await prisma.notification.count({
      where: {
        companyId: buyer.company.id,
        title: "Ödeme vadesi yaklaşıyor",
      },
    });
    expect(n).toBe(1);
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
  it("accept → ship → receive → madde 17: sipariş OTOMATİK tamamlanır; ödeme borcu sonradan kapanır", async () => {
    const orders = makeOrdersService();
    const { seller, buyer } = await twoParties();
    const order = await makeOrder(seller.company.id, buyer.company.id);

    await orders.accept(seller.auth, order.id, (await acceptInputFor(seller.company.id)) as never);
    await orders.ship(seller.auth, order.id, { invoiceNumber: "FTR-1" } as never);
    const rec = await orders.receive(buyer.auth, order.id, {} as never);
    expect(rec.status).toBe("COMPLETED"); // madde 17: teslim alma oto-tamamlar

    const payment = (await orders.recordPayment(buyer.auth, order.id, {
      amount: 1000,
      method: "EFT",
    } as never)) as { id: string };
    await orders.confirmPayment(seller.auth, order.id, payment.id);

    // YAŞAM DÖNGÜSÜ AYRIMI: ödeme onayı durumu değiştirmez — sipariş zaten
    // COMPLETED (madde 17); borç ödemeyle kapanır. complete() artık geçersiz
    // (yalnız legacy DELIVERED kayıtlar için).
    const db = await prisma.companyOrder.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(db.status).toBe("COMPLETED");
    expect(db.acceptedAt).not.toBeNull();
    expect(db.deliveryStartedAt).not.toBeNull();
    expect(db.deliveredAt).not.toBeNull();
    expect(db.completedAt).not.toBeNull();
    expect(db.invoiceNumber).toBe("FTR-1");
    await expect(
      orders.complete(buyer.auth, order.id, {} as never),
    ).rejects.toThrow(/uygun değil/);
  });
});

describe("BEFORE_DELIVERY (teslim öncesi ödeme) — teslim alma davranışı", () => {
  it("tam ödeme onaylı DEĞİLKEN teslim alma OTO-COMPLETED'a gider ve ödeme penceresi açık kalır", async () => {
    const orders = makeOrdersService();
    const { seller, buyer } = await twoParties();
    const order = await makeOrder(seller.company.id, buyer.company.id, {
      status: "IN_DELIVERY",
      paymentTiming: "BEFORE_DELIVERY",
      acceptedAt: new Date(),
      deliveryStartedAt: new Date(),
    });

    // Madde 17: teslim alma siparişi otomatik tamamlar; borç AYRI izlenir.
    const rec = await orders.receive(buyer.auth, order.id, {} as never);
    expect(rec.status).toBe("COMPLETED");

    // Kalan ödeme COMPLETED'da kaydedilebilmeli (pencere kapanmasın).
    const payment = (await orders.recordPayment(buyer.auth, order.id, {
      amount: 1000,
      method: "EFT",
    } as never)) as { id: string };
    await orders.confirmPayment(seller.auth, order.id, payment.id);
    const db = await prisma.companyOrder.findUniqueOrThrow({
      where: { id: order.id },
    });
    // Durum COMPLETED kalır; ödeme yalnız borcu kapatır.
    expect(db.status).toBe("COMPLETED");
  });

  it("tam ödeme ONAYLIYKEN teslim alma doğrudan COMPLETED (madde 17)", async () => {
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

  it("C1: CAD tam ödeme ONAYLIYKEN teslim alınır (madde 17: oto-COMPLETED)", async () => {
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
    expect(rec.status).toBe("COMPLETED"); // teslim kapısı geçildi + oto-tamamlandı
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

describe("tamamlama = alıcı kabulü (ödemeden BAĞIMSIZ — yaşam döngüsü ayrımı)", () => {
  const deliveredOrder = (sellerId: string, buyerId: string, amount = 1000) =>
    makeOrder(sellerId, buyerId, {
      status: "DELIVERED",
      amount,
      acceptedAt: new Date(),
      deliveryStartedAt: new Date(),
      deliveredAt: new Date(),
    });

  it("ödeme HİÇ yokken de alıcı siparişi tamamlayabilir (vadeli iş bitmiş, borç ayrı)", async () => {
    const orders = makeOrdersService();
    const { seller, buyer } = await twoParties();
    const order = await deliveredOrder(seller.company.id, buyer.company.id);
    const res = await orders.complete(buyer.auth, order.id, {} as never);
    expect(res.status).toBe("COMPLETED");
    // Borç açık kalır — ödeme durumu türetilir (getOne remaining > 0).
    const totals = await orders.getOne(buyer.auth, order.id);
    expect(Number(totals.paymentTotals.remaining)).toBe(1000);
  });

  it("kısmi ödemeyle de tamamlanır; kalan borç COMPLETED'da izlenmeye devam eder", async () => {
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
    const res = await orders.complete(buyer.auth, order.id, {} as never);
    expect(res.status).toBe("COMPLETED");
    // COMPLETED siparişte ödeme penceresi açık → kalan ödenebilir.
    const p = (await orders.recordPayment(buyer.auth, order.id, {
      amount: 600,
    } as never)) as { id: string };
    await orders.confirmPayment(seller.auth, order.id, p.id);
    const totals = await orders.getOne(buyer.auth, order.id);
    expect(Number(totals.paymentTotals.remaining)).toBe(0);
    // Ödeme sipariş DURUMUNU değiştirmedi — COMPLETED kaldı.
    const db = await prisma.companyOrder.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(db.status).toBe("COMPLETED");
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
  it("teminat şartlı sipariş BELGESİZ onaylanır — bayrak bilgi amaçlı (sipariş belgeleri kaldırıldı 2026-08-22)", async () => {
    const orders = makeOrdersService();
    const { seller, buyer } = await twoParties();
    const order = await makeOrder(seller.company.id, buyer.company.id, {
      paymentTiming: "BEFORE_DELIVERY",
      requireGuaranteeLetter: true,
    });
    const res = await orders.accept(
      seller.auth,
      order.id,
      (await acceptInputFor(seller.company.id)) as never,
    );
    expect(res.status).toBe("ACCEPTED");
    // Bayrak snapshot'ı korunur (UI bilgi notu için).
    const db = await prisma.companyOrder.findUniqueOrThrow({ where: { id: order.id } });
    expect(db.requireGuaranteeLetter).toBe(true);
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

  it("ödeme onayı sipariş DURUMUNU değiştirmez (tam ödeme oto-tamamlamaz)", async () => {
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
    let db = await prisma.companyOrder.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(db.status).toBe("DELIVERED"); // kısmi ödeme durumu değiştirmez

    // Kalan ödenip satıcı onaylasa da sipariş DELIVERED kalır (oto-tamamlama YOK).
    const p2 = (await orders.recordPayment(buyer.auth, order.id, {
      amount: 600,
    } as never)) as { id: string };
    await orders.confirmPayment(seller.auth, order.id, p2.id);
    db = await prisma.companyOrder.findUniqueOrThrow({ where: { id: order.id } });
    expect(db.status).toBe("DELIVERED");
    const totals = await orders.getOne(buyer.auth, order.id);
    expect(Number(totals.paymentTotals.confirmed)).toBe(1000);
    expect(Number(totals.paymentTotals.remaining)).toBe(0);
  });
});

describe("yaşam döngüsü ayrımı — vade cron kapsamı", () => {
  it("COMPLETED + vadesi yaklaşan vadeli sipariş → cron alıcıya vade bildirimi üretir", async () => {
    const orders = makeOrdersService();
    const { seller, buyer } = await twoParties();
    await makeOrder(seller.company.id, buyer.company.id, {
      status: "COMPLETED",
      completedAt: future(-2),
      deliveredAt: future(-58), // vade = +2 gün (3-gün ufku içinde)
      paymentTiming: "AFTER_DELIVERY",
      paymentCategory: "DEFERRED",
      paymentDays: 60,
      amount: 1000,
    });
    const sent = await orders.sendDuePaymentReminders();
    expect(sent).toBeGreaterThanOrEqual(1);
    const n = await prisma.notification.count({
      where: { companyId: buyer.company.id, title: "Ödeme vadesi yaklaşıyor" },
    });
    expect(n).toBe(1);
  });

  it("DISPUTED (ihtilaf) → cron vade bildirimi ÜRETMEZ (saat durur — A1/TTK korunur)", async () => {
    const orders = makeOrdersService();
    const { seller, buyer } = await twoParties();
    await makeOrder(seller.company.id, buyer.company.id, {
      status: "DISPUTED",
      deliveredAt: future(-58),
      defectNotifiedAt: new Date(),
      disputePrevStatus: "COMPLETED",
      paymentTiming: "AFTER_DELIVERY",
      paymentCategory: "DEFERRED",
      paymentDays: 60,
      amount: 1000,
    });
    await orders.sendDuePaymentReminders();
    const n = await prisma.notification.count({
      where: { companyId: buyer.company.id, title: "Ödeme vadesi yaklaşıyor" },
    });
    expect(n).toBe(0);
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

  it("uçtan uca: açıldı (beyan, belgesiz) → kabul → gönder → banka ödedi → tamamlandı", async () => {
    const orders = makeOrdersService();
    const { seller, buyer } = await twoParties();
    const order = await lcOrder(seller.company.id, buyer.company.id);

    // "Akreditif Açıldı" beyandır — belge yüklemesi kaldırıldı (2026-08-22).
    await orders.lcMarkOpened(buyer.auth, order.id);

    // Kabul edilmeden gönderilemez.
    await expect(
      orders.ship(seller.auth, order.id, { invoiceNumber: "F1" } as never),
    ).rejects.toThrow(/kabul/i);

    await orders.lcMarkAccepted(seller.auth, order.id);
    // Kabulden sonra gönderilebilir.
    await orders.ship(seller.auth, order.id, { invoiceNumber: "F1" } as never);
    // Madde 17: teslim alma siparişi otomatik tamamlar (LC'de de).
    await orders.receive(buyer.auth, order.id, {} as never);

    let db = await prisma.companyOrder.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(db.status).toBe("COMPLETED");

    // Banka ödedi → sistem onaylı tam-tutar kaydı + lcPaidAt. Yaşam döngüsü
    // ayrımı: borç ödeme kaydıyla kapanır; durum zaten COMPLETED.
    await orders.lcMarkPaid(seller.auth, order.id);
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

    await orders.lcMarkPaid(seller.auth, order.id);

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

describe("INV-MONEY-1 — Decimal sınır (epsilon YOK)", () => {
  it("ödeme durumu (türetilen): tam-eşit = kapalı (remaining 0); 1 kuruş eksik = AÇIK (epsilon yok)", async () => {
    const orders = makeOrdersService();
    const { seller, buyer } = await twoParties();
    // 1 kuruş EKSİK → remaining 0.01 > 0 → ödeme AÇIK (eski 0.01 epsilon'u
    // tam-sayardı = bug). Yaşam döngüsü ayrımı: bu ödeme durumu, sipariş
    // tamamlamayı ETKİLEMEZ (complete = kabul, ödemeden bağımsız).
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
    const st = await orders.getOne(buyer.auth, short.id);
    expect(Number(st.paymentTotals.remaining)).toBe(0.01); // kapanmadı
    // TAM eşit → remaining 0 → ödeme kapandı.
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
    const et = await orders.getOne(buyer.auth, exact.id);
    expect(Number(et.paymentTotals.remaining)).toBe(0);
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

describe("accept: tahmini teslim tarihi SORULMAZ — kalem tarihlerinden türetilir (2026-08-02)", () => {
  it("tarihsiz accept → expectedDeliveryDate = kalem teslim tarihlerinin en geci; kalemler tarihsizse null", async () => {
    const orders = makeOrdersService();
    const { seller, buyer } = await twoParties();
    const order = await makeOrder(seller.company.id, buyer.company.id, {
      status: "PENDING",
    });
    const early = future(3);
    const late = future(9);
    await prisma.companyOrderItem.createMany({
      data: [
        {
          orderId: order.id,
          name: "Kalem A",
          quantity: 1,
          unit: "adet",
          unitPrice: 500,
          deliveryDate: early,
        },
        {
          orderId: order.id,
          name: "Kalem B",
          quantity: 1,
          unit: "adet",
          unitPrice: 500,
          deliveryDate: late,
        },
      ],
    });
    const acct = await acceptInputFor(seller.company.id);
    await orders.accept(seller.auth, order.id, {
      bankAccountId: acct.bankAccountId,
    } as never);
    const o = await prisma.companyOrder.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(o.status).toBe("ACCEPTED");
    expect(o.expectedDeliveryDate?.getTime()).toBe(late.getTime());

    // Kalemleri tarihsiz sipariş: tarihsiz accept → null kalır (gösterim dayanıklı).
    const order2 = await makeOrder(seller.company.id, buyer.company.id, {
      status: "PENDING",
    });
    await prisma.companyOrderItem.create({
      data: {
        orderId: order2.id,
        name: "Kalem C",
        quantity: 1,
        unit: "adet",
        unitPrice: 1000,
      },
    });
    const acct2 = await acceptInputFor(seller.company.id);
    await orders.accept(seller.auth, order2.id, {
      bankAccountId: acct2.bankAccountId,
    } as never);
    const o2 = await prisma.companyOrder.findUniqueOrThrow({
      where: { id: order2.id },
    });
    expect(o2.expectedDeliveryDate).toBeNull();

    // Açıkça tarih verilirse (API geriye-uyumluluk) aynen yazılır.
    const order3 = await makeOrder(seller.company.id, buyer.company.id, {
      status: "PENDING",
    });
    const explicit = future(14);
    const acct3 = await acceptInputFor(seller.company.id);
    await orders.accept(seller.auth, order3.id, {
      bankAccountId: acct3.bankAccountId,
      expectedDeliveryDate: explicit.toISOString(),
    } as never);
    const o3 = await prisma.companyOrder.findUniqueOrThrow({
      where: { id: order3.id },
    });
    expect(o3.expectedDeliveryDate?.getTime()).toBe(explicit.getTime());
  });
});
