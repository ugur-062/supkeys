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

describe("teminat mektubu — teslim ÖNCESİ ödeme (BEFORE_DELIVERY)", () => {
  it("teslim öncesi ödemeli sipariş, teminat belgesi yüklenmeden onaylanamaz", async () => {
    const orders = makeOrdersService();
    const { seller, buyer } = await twoParties();
    const order = await makeOrder(seller.company.id, buyer.company.id, {
      paymentTiming: "BEFORE_DELIVERY",
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

  it("teslim SONRASI ödemede (COD/vadeli) teminat istenmez — peşin olsa bile", async () => {
    const orders = makeOrdersService();
    const { seller, buyer } = await twoParties();
    // Peşin (CASH) ilan ama ödeme teslim SONRASI → alıcı riskte değil, teminat yok.
    const listing = await makeListing(prisma, {
      companyId: buyer.company.id,
      createdById: buyer.user.id,
      type: "ALIM",
      status: "AWARDED",
      paymentTerm: "CASH",
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
