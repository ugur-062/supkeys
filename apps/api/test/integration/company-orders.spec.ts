/**
 * Sipariş servisi — Siparişlerim paritesi:
 * - sipariş para birimi = KAZANAN TEKLİFİN birimi (çoklu-birim RFQ)
 * - liste/detay yeni alanları: listingId/listingType/counterpartyCompanyId
 * - detayda karşı taraf kurumsal özeti (şehir/sektör/e-posta/telefon)
 * - SATIS kalem-bazlı kazandırma: satıcı=ilan sahibi, alıcı=teklifçi
 */
import { CompanyOrdersService } from "../../src/modules/company-orders/services/company-orders.service";
import { AuditService } from "../../src/modules/audit/audit.service";
import { NotificationService } from "../../src/modules/notifications/notification.service";
import { prisma, truncateAll } from "./test-db";
import { connect, makeCompanyWithUser } from "./factories";
import { makeService } from "./make-service";

const future = (days: number) => new Date(Date.now() + days * 86_400_000);
const bidBase = {
  deliveryDate: future(7).toISOString(),
  validityDays: 30,
};

function makeOrdersService() {
  const email = { send: jest.fn().mockResolvedValue({ emailLogId: "test" }) };
  const config = { get: jest.fn().mockReturnValue("http://localhost:3000") };
  const notifications = new NotificationService(prisma as never);
  const orders = new CompanyOrdersService(
    prisma as never,
    email as never,
    config as never,
    notifications,
    new AuditService(prisma as never),
    prisma as never, // RLS bypass client (testte RLS kapali -> prisma ile ayni owner)
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

describe("sipariş para birimi + yeni liste/detay alanları", () => {
  it("USD teklif kazandırılınca sipariş USD; detay karşı taraf özetini döner", async () => {
    const { service } = makeService();
    const { orders } = makeOrdersService();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const seller = await makeCompanyWithUser(prisma, { country: "TR" });
    await connect(prisma, owner.company.id, seller.company.id, owner.user.id);
    await prisma.company.update({
      where: { id: seller.company.id },
      data: {
        city: "İzmir",
        industry: "Metal",
        billingEmail: "satis@firma.local",
        billingPhone: "+90 555 111 22 33",
      },
    });

    const listing = await service.create(owner.auth, {
      type: "ALIM",
      format: "RFQ",
      isInternational: false,
      visibility: "CONNECTIONS",
      title: "Çelik levha alımı",
      closesAt: future(3).toISOString(),
      primaryCurrency: "TRY",
      allowedCurrencies: ["TRY", "USD"],
      items: [{ name: "Levha", quantity: 1, unit: "adet" }],
    } as never);

    const item = await prisma.listingItem.findFirstOrThrow({
      where: { listingId: listing.id },
    });
    await service.placeBid(seller.auth, listing.id, {
      items: [{ itemId: item.id, unitPrice: 100 }],
      currency: "USD",
      ...bidBase,
    } as never);
    const bid = await prisma.listingBid.findFirstOrThrow({
      where: { listingId: listing.id },
    });
    await service.award(owner.auth, listing.id, bid.id);

    // Liste (alıcı gözünden): para birimi USD + yeni alanlar.
    const mine = await orders.list(owner.company.id);
    expect(mine).toHaveLength(1);
    const row = mine[0]!;
    expect(row.currency).toBe("USD");
    expect(row.role).toBe("buyer");
    expect(row.listingId).toBe(listing.id);
    expect(row.listingType).toBe("ALIM");
    expect(row.counterpartyCompanyId).toBe(seller.company.id);

    // Detay: karşı taraf kurumsal özeti (satıcı firma).
    const detail = await orders.getOne(owner.auth, row.id);
    expect(detail.currency).toBe("USD");
    expect(detail.counterpartyProfile).toEqual({
      city: "İzmir",
      industry: "Metal",
      email: "satis@firma.local",
      phone: "+90 555 111 22 33",
      rothernId: null,
    });

    // Satıcı gözünden aynı sipariş: role seller, karşı taraf = alıcı firma.
    const theirs = await orders.list(seller.company.id);
    expect(theirs[0]!.role).toBe("seller");
    expect(theirs[0]!.counterpartyCompanyId).toBe(owner.company.id);
  });
});

describe("list() — daraltılmış select serialize alanlarını KORUR", () => {
  it("deliveryTerm/paymentCategory/paymentDays/advancePercent liste satırında gelir (over-fetch daraltması alan düşürmedi)", async () => {
    const { orders } = makeOrdersService();
    const seller = await makeCompanyWithUser(prisma, { country: "TR" });
    const buyer = await makeCompanyWithUser(prisma, { country: "TR" });
    await prisma.companyOrder.create({
      data: {
        sellerCompanyId: seller.company.id,
        buyerCompanyId: buyer.company.id,
        amount: 1500,
        currency: "TRY",
        status: "ACCEPTED",
        deliveryTerm: "EXW",
        paymentCategory: "DEFERRED",
        paymentDays: 45,
        advancePercent: 20,
      },
    });

    const rows = await orders.list(seller.company.id);
    expect(rows).toHaveLength(1);
    const r = rows[0]!;
    // Eskiden full-include ile gelen, artık explicit select'teki alanlar:
    expect(r.deliveryTerm).toBe("EXW");
    expect(r.paymentCategory).toBe("DEFERRED");
    expect(r.paymentDays).toBe(45);
    expect(r.advancePercent).toBe(20);
    // Çekirdek + relation-türevi alanlar da tam:
    expect(r.role).toBe("seller");
    expect(r.amount).toBe("1500");
    expect(r.currency).toBe("TRY");
    expect(r.counterpartyCompanyId).toBe(buyer.company.id);
    expect(r.counterparty).toBe(buyer.company.name);
  });
});

describe("SATIS kalem-bazlı kazandırma — sipariş yönü", () => {
  it("her kazanan alıcıya ayrı sipariş: satıcı=ilan sahibi, alıcı=teklifçi, birim=teklifin", async () => {
    const { service } = makeService();
    const { orders } = makeOrdersService();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const b1 = await makeCompanyWithUser(prisma, { country: "TR" });
    const b2 = await makeCompanyWithUser(prisma, { country: "TR" });
    await connect(prisma, owner.company.id, b1.company.id, owner.user.id);
    await connect(prisma, owner.company.id, b2.company.id, owner.user.id);

    const listing = await service.create(owner.auth, {
      type: "SATIS",
      format: "RFQ",
      isInternational: false,
      visibility: "CONNECTIONS",
      title: "Hurda satışı — iki kalem",
      closesAt: future(3).toISOString(),
      minPrice: 100,
      items: [
        { name: "Bakır", quantity: 1, unit: "ton" },
        { name: "Alüminyum", quantity: 1, unit: "ton" },
      ],
    } as never);
    const items = await prisma.listingItem.findMany({
      where: { listingId: listing.id },
      orderBy: { lineNo: "asc" },
    });

    // b1 her iki kaleme, b2 yalnız ikinci kaleme teklif verir.
    await service.placeBid(b1.auth, listing.id, {
      items: [
        { itemId: items[0]!.id, unitPrice: 1000 },
        { itemId: items[1]!.id, unitPrice: 900 },
      ],
      ...bidBase,
    } as never);
    await service.placeBid(b2.auth, listing.id, {
      items: [{ itemId: items[1]!.id, unitPrice: 1200 }],
      ...bidBase,
    } as never);
    const bids = await prisma.listingBid.findMany({
      where: { listingId: listing.id },
    });
    const bid1 = bids.find((b) => b.bidderCompanyId === b1.company.id)!;
    const bid2 = bids.find((b) => b.bidderCompanyId === b2.company.id)!;

    // Kalem 1 → b1, kalem 2 → b2 (en yüksek).
    const res = (await service.awardByItem(owner.auth, listing.id, [
      { itemId: items[0]!.id, bidId: bid1.id },
      { itemId: items[1]!.id, bidId: bid2.id },
    ])) as { orders: { id: string }[]; count: number };
    expect(res.count).toBe(2);

    const rows = await prisma.companyOrder.findMany({
      where: { listingId: listing.id },
    });
    expect(rows).toHaveLength(2);
    for (const o of rows) {
      // SATIS: ilan sahibi HER siparişte satıcıdır.
      expect(o.sellerCompanyId).toBe(owner.company.id);
      expect([b1.company.id, b2.company.id]).toContain(o.buyerCompanyId);
      expect(o.currency).toBe("TRY");
    }

    // Teklifçi (b2) kendi portalında ALICI rolüyle görür.
    const b2Orders = await orders.list(b2.company.id);
    expect(b2Orders).toHaveLength(1);
    expect(b2Orders[0]!.role).toBe("buyer");
    expect(Number(b2Orders[0]!.amount)).toBe(1200);
    expect(b2Orders[0]!.counterpartyCompanyId).toBe(owner.company.id);
  });
});

describe("tamamlama = alıcı kabulü (ödemeden bağımsız — yaşam döngüsü ayrımı)", () => {
  it("bekleyen/kısmi ödemeye rağmen tamamlanabilir; borç COMPLETED'da ayrı izlenir", async () => {
    const { orders } = makeOrdersService();
    const seller = await makeCompanyWithUser(prisma, { country: "TR" });
    const buyer = await makeCompanyWithUser(prisma, { country: "TR" });
    const order = await prisma.companyOrder.create({
      data: {
        sellerCompanyId: seller.company.id,
        buyerCompanyId: buyer.company.id,
        amount: 1000,
        status: "DELIVERED",
        paymentTiming: "AFTER_DELIVERY",
        deliveredAt: new Date(),
      },
    });

    // Alıcı KISMİ ödeme kaydı girer (AWAITING_CONFIRMATION).
    const p1 = (await orders.recordPayment(buyer.auth, order.id, {
      amount: 500,
      method: "EFT",
    } as never)) as { id: string };
    await orders.confirmPayment(seller.auth, order.id, p1.id);

    // YAŞAM DÖNGÜSÜ AYRIMI: kısmi ödemeye rağmen alıcı malı kabul edip tamamlar.
    const res = await orders.complete(buyer.auth, order.id, {} as never);
    expect(res.status).toBe("COMPLETED");

    // Borç COMPLETED'da açık; kalan ödenebilir, durum değişmez.
    const p2 = (await orders.recordPayment(buyer.auth, order.id, {
      amount: 500,
      method: "EFT",
    } as never)) as { id: string };
    await orders.confirmPayment(seller.auth, order.id, p2.id);
    const db = await prisma.companyOrder.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(db.status).toBe("COMPLETED");
    const totals = await orders.getOne(buyer.auth, order.id);
    expect(Number(totals.paymentTotals.remaining)).toBe(0);
  });
});

describe("ödeme kap koruması — atomik (fazla-tahsilat yarışı)", () => {
  it("eşzamanlı iki ödeme kaydı sipariş tutarını AŞAMAZ (FOR UPDATE kilidi)", async () => {
    const { orders } = makeOrdersService();
    const seller = await makeCompanyWithUser(prisma, { country: "TR" });
    const buyer = await makeCompanyWithUser(prisma, { country: "TR" });
    const order = await prisma.companyOrder.create({
      data: {
        sellerCompanyId: seller.company.id,
        buyerCompanyId: buyer.company.id,
        amount: 1000,
        status: "DELIVERED",
        paymentTiming: "AFTER_DELIVERY",
        deliveredAt: new Date(),
      },
    });

    // İkisi de 700 → toplam 1400 > 1000; atomik cap yalnız birine izin vermeli.
    const results = await Promise.allSettled([
      orders.recordPayment(buyer.auth, order.id, {
        amount: 700,
        method: "EFT",
      } as never),
      orders.recordPayment(buyer.auth, order.id, {
        amount: 700,
        method: "EFT",
      } as never),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);

    // DB'de kayıtlı toplam sipariş tutarını aşmamalı.
    const sum = await prisma.companyOrderPayment.aggregate({
      where: {
        orderId: order.id,
        status: { in: ["AWAITING_CONFIRMATION", "CONFIRMED"] },
      },
      _sum: { amount: true },
    });
    expect(Number(sum._sum.amount ?? 0)).toBeLessThanOrEqual(1000);
  });

  it("S4: ONAYLANMAMIŞ (AWAITING) ödeme de cap'i rezerve eder (committed=AWAITING+CONFIRMED)", async () => {
    const { orders } = makeOrdersService();
    const seller = await makeCompanyWithUser(prisma, { country: "TR" });
    const buyer = await makeCompanyWithUser(prisma, { country: "TR" });
    const order = await prisma.companyOrder.create({
      data: {
        sellerCompanyId: seller.company.id,
        buyerCompanyId: buyer.company.id,
        amount: 1000,
        status: "DELIVERED",
        paymentTiming: "AFTER_DELIVERY",
        deliveredAt: new Date(),
      },
    });
    // Tam tutarlı ödeme kaydı — ONAYLANMADAN AWAITING_CONFIRMATION'da bekler.
    await orders.recordPayment(buyer.auth, order.id, {
      amount: 1000,
      method: "EFT",
    } as never);
    // İkinci ödeme (onaysız bile olsa) committed cap'i aşar → reddedilir.
    await expect(
      orders.recordPayment(buyer.auth, order.id, {
        amount: 1,
        method: "EFT",
      } as never),
    ).rejects.toThrow(/aşan ödeme kaydedilemez/);
  });
});

describe("kargo kapısı — satıcı, bekleyen ödemeyi sonuçlandırmadan kargolayamaz", () => {
  it("bekleyen ödeme varken ship reddedilir; satıcı onaylayınca kargolanır", async () => {
    const { orders } = makeOrdersService();
    const seller = await makeCompanyWithUser(prisma, { country: "TR" });
    const buyer = await makeCompanyWithUser(prisma, { country: "TR" });
    // Teslim öncesi ödemeli sipariş — ACCEPTED'da ödeme kaydı girilebilir.
    const order = await prisma.companyOrder.create({
      data: {
        sellerCompanyId: seller.company.id,
        buyerCompanyId: buyer.company.id,
        amount: 1000,
        status: "ACCEPTED",
        paymentTiming: "BEFORE_DELIVERY",
        acceptedAt: new Date(),
      },
    });
    const payment = (await orders.recordPayment(buyer.auth, order.id, {
      amount: 500,
      method: "EFT",
    } as never)) as { id: string };

    await expect(
      orders.ship(seller.auth, order.id, { invoiceNumber: "FTR-1" } as never),
    ).rejects.toThrow(/onay bekleyen ödeme/);

    await orders.confirmPayment(seller.auth, order.id, payment.id);
    const res = await orders.ship(seller.auth, order.id, {
      invoiceNumber: "FTR-1",
    } as never);
    expect(res.status).toBe("IN_DELIVERY");
  });
});
