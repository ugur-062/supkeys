/**
 * Sipariş servisi — Siparişlerim paritesi:
 * - sipariş para birimi = KAZANAN TEKLİFİN birimi (çoklu-birim RFQ)
 * - liste/detay yeni alanları: listingId/listingType/counterpartyCompanyId
 * - detayda karşı taraf kurumsal özeti (şehir/sektör/e-posta/telefon)
 * - SATIS kalem-bazlı kazandırma: satıcı=ilan sahibi, alıcı=teklifçi
 */
import { CompanyOrderDocumentsService } from "../../src/modules/company-orders/company-order-documents.service";
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

describe("sipariş belgesi register — anahtar/MIME doğrulaması (F4)", () => {
  it("yabancı key prefix'i ve izinsiz MIME reddedilir; doğru key kaydedilir", async () => {
    const storage = {
      generatePresignedPut: jest.fn().mockResolvedValue("https://r2/put"),
      generatePresignedGet: jest.fn().mockResolvedValue("https://r2/get"),
      checkExists: jest.fn().mockResolvedValue({ exists: true, size: 2048 }),
      deleteObject: jest.fn().mockResolvedValue(undefined),
    };
    const docs = new CompanyOrderDocumentsService(
      prisma as never,
      storage as never,
    );
    const seller = await makeCompanyWithUser(prisma, { country: "TR" });
    const buyer = await makeCompanyWithUser(prisma, { country: "TR" });
    const order = await prisma.companyOrder.create({
      data: {
        sellerCompanyId: seller.company.id,
        buyerCompanyId: buyer.company.id,
        amount: 1000,
        status: "ACCEPTED",
      },
    });

    // Başka nesnenin key'i kayıt edilemez (indirilebilir hâle getirilemez).
    await expect(
      docs.register(seller.auth, order.id, {
        type: "DELIVERY" as never,
        key: "company-docs/baska-firma/kimlik-on.png",
        fileName: "kimlik.png",
        mimeType: "image/png",
      }),
    ).rejects.toThrow(/Geçersiz dosya anahtarı/);

    // İzinli MIME dışı reddedilir (upload-url'deki kontrol register'da da).
    await expect(
      docs.register(seller.auth, order.id, {
        type: "DELIVERY" as never,
        key: `company-orders/${order.id}/delivery/x-irsaliye.exe`,
        fileName: "irsaliye.exe",
        mimeType: "application/x-msdownload",
      }),
    ).rejects.toThrow(/PDF veya görsel/);

    // Doğru prefix + izinli MIME kaydedilir.
    const ok = await docs.register(seller.auth, order.id, {
      type: "DELIVERY" as never,
      key: `company-orders/${order.id}/delivery/u-irsaliye.pdf`,
      fileName: "irsaliye.pdf",
      mimeType: "application/pdf",
    });
    expect(ok.id).toBeTruthy();
  });
});

describe("sipariş belgesi — adım bazlı yükleme kilidi", () => {
  function makeDocsService() {
    const storage = {
      generatePresignedPut: jest.fn().mockResolvedValue("https://r2/put"),
      generatePresignedGet: jest.fn().mockResolvedValue("https://r2/get"),
      checkExists: jest.fn().mockResolvedValue({ exists: true, size: 2048 }),
      deleteObject: jest.fn().mockResolvedValue(undefined),
    };
    return new CompanyOrderDocumentsService(
      prisma as never,
      storage as never,
    );
  }
  const pdf = (type: string) => ({
    fileName: "x.pdf",
    mimeType: "application/pdf",
    type: type as never,
    fileSize: 1024,
  });
  async function party() {
    const seller = await makeCompanyWithUser(prisma, { country: "TR" });
    const buyer = await makeCompanyWithUser(prisma, { country: "TR" });
    return { seller, buyer };
  }
  const mkOrder = (
    sellerId: string,
    buyerId: string,
    status: string,
    timing: string = "AFTER_DELIVERY",
  ) =>
    prisma.companyOrder.create({
      data: {
        sellerCompanyId: sellerId,
        buyerCompanyId: buyerId,
        amount: 1000,
        status: status as never,
        paymentTiming: timing as never,
      },
    });

  it("alıcı, satıcı onaylamadan (PENDING) ödeme dekontu yükleyemez", async () => {
    const docs = makeDocsService();
    const { seller, buyer } = await party();
    const order = await mkOrder(seller.company.id, buyer.company.id, "PENDING");
    await expect(
      docs.requestUploadUrl(buyer.auth, order.id, pdf("PAYMENT")),
    ).rejects.toThrow(/ödeme adımı|ödeme dekontu/i);
  });

  it("satıcı, onaydan önce (PENDING) teslim belgesi yükleyemez", async () => {
    const docs = makeDocsService();
    const { seller, buyer } = await party();
    const order = await mkOrder(seller.company.id, buyer.company.id, "PENDING");
    await expect(
      docs.requestUploadUrl(seller.auth, order.id, pdf("DELIVERY")),
    ).rejects.toThrow(/onaylandıktan sonra/i);
  });

  it("satıcı, onaydan SONRA (ACCEPTED) teminat mektubu yükleyemez", async () => {
    const docs = makeDocsService();
    const { seller, buyer } = await party();
    const order = await mkOrder(seller.company.id, buyer.company.id, "ACCEPTED");
    await expect(
      docs.requestUploadUrl(seller.auth, order.id, pdf("TEMINAT")),
    ).rejects.toThrow(/onayından önce/i);
  });

  it("evre uygunsa yükleme URL'i üretilir (PENDING→teminat, ACCEPTED→teslim, teslim sonrası→dekont)", async () => {
    const docs = makeDocsService();
    const { seller, buyer } = await party();
    const pending = await mkOrder(
      seller.company.id,
      buyer.company.id,
      "PENDING",
    );
    await expect(
      docs.requestUploadUrl(seller.auth, pending.id, pdf("TEMINAT")),
    ).resolves.toHaveProperty("url");

    const accepted = await mkOrder(
      seller.company.id,
      buyer.company.id,
      "ACCEPTED",
    );
    await expect(
      docs.requestUploadUrl(seller.auth, accepted.id, pdf("DELIVERY")),
    ).resolves.toHaveProperty("url");

    // AFTER_DELIVERY: ödeme yalnız teslim alındıktan sonra.
    const delivered = await mkOrder(
      seller.company.id,
      buyer.company.id,
      "DELIVERED",
      "AFTER_DELIVERY",
    );
    await expect(
      docs.requestUploadUrl(buyer.auth, delivered.id, pdf("PAYMENT")),
    ).resolves.toHaveProperty("url");
  });

  const mkTeminat = (orderId: string, companyId: string) =>
    prisma.companyOrderDocument.create({
      data: {
        orderId,
        type: "TEMINAT",
        key: `company-orders/${orderId}/teminat/x.pdf`,
        fileName: "teminat.pdf",
        mimeType: "application/pdf",
        uploadedByCompanyId: companyId,
      },
    });

  it("teminat mektubu onaydan SONRA (ACCEPTED) silinemez", async () => {
    const docs = makeDocsService();
    const { seller, buyer } = await party();
    const order = await mkOrder(seller.company.id, buyer.company.id, "ACCEPTED");
    const doc = await mkTeminat(order.id, seller.company.id);
    await expect(
      docs.remove(seller.auth, order.id, doc.id),
    ).rejects.toThrow(/onaylandıktan sonra silinemez/i);
    // Belge duruyor.
    expect(
      await prisma.companyOrderDocument.count({ where: { id: doc.id } }),
    ).toBe(1);
  });

  it("teminat mektubu onay öncesi (PENDING) silinebilir", async () => {
    const docs = makeDocsService();
    const { seller, buyer } = await party();
    const order = await mkOrder(seller.company.id, buyer.company.id, "PENDING");
    const doc = await mkTeminat(order.id, seller.company.id);
    await expect(
      docs.remove(seller.auth, order.id, doc.id),
    ).resolves.toEqual({ ok: true });
  });

  // ── Faz 4: fatura belgesi (satıcı) + serbest ek belge kutusu (her iki taraf) ──

  it("fatura belgesi: satıcı onaydan sonra yükleyebilir; PENDING'de ve alıcıda reddedilir", async () => {
    const docs = makeDocsService();
    const { seller, buyer } = await party();
    const pending = await mkOrder(
      seller.company.id,
      buyer.company.id,
      "PENDING",
    );
    await expect(
      docs.requestUploadUrl(seller.auth, pending.id, pdf("INVOICE")),
    ).rejects.toThrow(/onaylandıktan sonra/i);

    const accepted = await mkOrder(
      seller.company.id,
      buyer.company.id,
      "ACCEPTED",
    );
    await expect(
      docs.requestUploadUrl(seller.auth, accepted.id, pdf("INVOICE")),
    ).resolves.toHaveProperty("url");
    // Alıcı fatura yükleyemez.
    await expect(
      docs.requestUploadUrl(buyer.auth, accepted.id, pdf("INVOICE")),
    ).rejects.toThrow(/satıcı yükler/i);
  });

  it("diğer belgeler (OTHER): her iki taraf yükler; sonlanmış siparişte reddedilir", async () => {
    const docs = makeDocsService();
    const { seller, buyer } = await party();
    const accepted = await mkOrder(
      seller.company.id,
      buyer.company.id,
      "ACCEPTED",
    );
    await expect(
      docs.requestUploadUrl(seller.auth, accepted.id, pdf("OTHER")),
    ).resolves.toHaveProperty("url");
    await expect(
      docs.requestUploadUrl(buyer.auth, accepted.id, pdf("OTHER")),
    ).resolves.toHaveProperty("url");

    const cancelled = await mkOrder(
      seller.company.id,
      buyer.company.id,
      "CANCELLED",
    );
    await expect(
      docs.requestUploadUrl(buyer.auth, cancelled.id, pdf("OTHER")),
    ).rejects.toThrow(/sonlanmış/i);
  });

  it("akreditif belgesi (LC): DTO enum'unda tanımlı — alıcı LC siparişte yükler (Faz 3 DTO düzeltmesi)", async () => {
    const docs = makeDocsService();
    const { seller, buyer } = await party();
    const lcOrder = await prisma.companyOrder.create({
      data: {
        sellerCompanyId: seller.company.id,
        buyerCompanyId: buyer.company.id,
        amount: 1000,
        status: "ACCEPTED",
        paymentCategory: "LETTER_OF_CREDIT",
        lcType: "SIGHT",
      } as never,
    });
    await expect(
      docs.requestUploadUrl(buyer.auth, lcOrder.id, pdf("LC")),
    ).resolves.toHaveProperty("url");
    // LC olmayan siparişte reddedilir.
    const plain = await mkOrder(seller.company.id, buyer.company.id, "ACCEPTED");
    await expect(
      docs.requestUploadUrl(buyer.auth, plain.id, pdf("LC")),
    ).rejects.toThrow(/akreditifli değil/i);
  });
});
