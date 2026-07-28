/**
 * ARAYÜZ KİLİDİ = API KİLİDİ — sözleşme testleri (2026-07-28).
 *
 * Hata sınıfı: kural var ama TEK yolda uygulanıyor; arayüz alanı kilitliyor,
 * servis aynı kontrolü yapmıyor → doğrudan istekle baypas. Bu oturumda beş
 * örneği bulundu ve kapatıldı; bu spec kapanan kilitleri sözleşmeye bağlar ki
 * bir daha sessizce açılmasınlar.
 *
 * Kapsanan kilitler:
 *  1. Gönderilmiş teklifin belgeleri değiştirilemez (bağlayıcı teklif içeriği)
 *  2. Kullanımdaki adresin YERİ değiştirilemez (iletişim alanları serbest)
 *  3. İhale belgeleri: HERHANGİ teklif kaydı kilitler (updateListing ile birebir)
 *  4. Taslak/embargolu ilanın şartnamesi indirilemez (getOne'ın aynası)
 *  5. Sipariş belgesi, etki doğduktan sonra silinemez
 */
import { CompanyBidDocumentsService } from "../../src/modules/company-bid-documents/company-bid-documents.service";
import { CompanyListingDocumentsService } from "../../src/modules/company-listing-documents/company-listing-documents.service";
import { CompanyAddressesService } from "../../src/modules/company-addresses/company-addresses.service";
import { CompanyOrderDocumentsService } from "../../src/modules/company-orders/company-order-documents.service";
import { CompanyBlocksService } from "../../src/modules/company-blocks/company-blocks.service";
import { AuditService } from "../../src/modules/audit/audit.service";
import {
  connect,
  makeBid,
  makeCompanyWithUser,
  makeItem,
  makeListing,
} from "./factories";
import { prisma, truncateAll } from "./test-db";

const FUTURE = new Date(Date.now() + 7 * 86_400_000);

function storageMock() {
  return {
    generatePresignedPut: jest.fn().mockResolvedValue("https://r2.test/put"),
    generatePresignedGet: jest.fn().mockResolvedValue("https://r2.test/get"),
    deleteObject: jest.fn().mockResolvedValue(undefined),
    checkExists: jest.fn().mockResolvedValue({ exists: true, size: 1024 }),
  };
}

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

// ───────────────────────── 1. Teklif belgeleri ─────────────────────────

describe("gönderilmiş teklifin belgeleri değiştirilemez", () => {
  async function setup(bidStatus: "DRAFT" | "SUBMITTED") {
    const buyer = await makeCompanyWithUser(prisma, { country: "TR" });
    const supplier = await makeCompanyWithUser(prisma, { country: "TR" });
    await connect(
      prisma,
      buyer.company.id,
      supplier.company.id,
      buyer.user.id,
    );
    const listing = await makeListing(prisma, {
      companyId: buyer.company.id,
      createdById: buyer.user.id,
      type: "ALIM",
      status: "OPEN",
      closesAt: FUTURE,
    });
    const item = await makeItem(prisma, listing.id);
    const bid = await makeBid(prisma, {
      listingId: listing.id,
      bidderCompanyId: supplier.company.id,
      createdById: supplier.user.id,
      amount: 100,
      status: bidStatus,
      items: [{ itemId: item.id, unitPrice: 100 }],
    });
    const doc = await prisma.listingBidDocument.create({
      data: {
        bidId: bid.id,
        kind: "DIGER",
        key: `listing-bids/${listing.id}/${supplier.company.id}/x.pdf`,
        fileName: "x.pdf",
        mimeType: "application/pdf",
        uploadedByCompanyId: supplier.company.id,
      },
    });
    return { supplier, listing, doc };
  }

  it("SUBMITTED teklife belge EKLENEMEZ (presign + kayıt)", async () => {
    const { service } = { service: new CompanyBidDocumentsService(prisma as never, storageMock() as never) };
    const { supplier, listing } = await setup("SUBMITTED");
    await expect(
      service.requestUploadUrl(supplier.auth, listing.id, {
        fileName: "yeni.pdf",
        mimeType: "application/pdf",
      }),
    ).rejects.toThrow(/Gönderilmiş teklifin belgeleri/);
    await expect(
      service.register(supplier.auth, listing.id, {
        key: `listing-bids/${listing.id}/${supplier.company.id}/yeni.pdf`,
        fileName: "yeni.pdf",
        mimeType: "application/pdf",
      }),
    ).rejects.toThrow(/Gönderilmiş teklifin belgeleri/);
  });

  it("SUBMITTED teklifin belgesi SİLİNEMEZ — kayıt yerinde kalır", async () => {
    const service = new CompanyBidDocumentsService(prisma as never, storageMock() as never);
    const { supplier, listing, doc } = await setup("SUBMITTED");
    await expect(
      service.remove(supplier.auth, listing.id, doc.id),
    ).rejects.toThrow(/Gönderilmiş teklifin belgeleri/);
    expect(
      await prisma.listingBidDocument.count({ where: { id: doc.id } }),
    ).toBe(1);
  });

  it("DRAFT teklifte belge yönetimi SERBEST (pozitif kontrol)", async () => {
    const service = new CompanyBidDocumentsService(prisma as never, storageMock() as never);
    const { supplier, listing, doc } = await setup("DRAFT");
    await expect(
      service.remove(supplier.auth, listing.id, doc.id),
    ).resolves.toEqual({ ok: true });
  });
});

// ───────────────────────── 2. Adres güncelleme ─────────────────────────

describe("kullanımdaki adresin yeri değiştirilemez", () => {
  const svc = () =>
    new CompanyAddressesService(prisma as never, new AuditService(prisma as never));

  async function setupAddressInOpenListing() {
    const buyer = await makeCompanyWithUser(prisma, { country: "TR" });
    const addr = await prisma.companyAddress.create({
      data: {
        companyId: buyer.company.id,
        type: "TESLIMAT",
        title: "Depo",
        addressLine: "Örnek mah. No:1",
        city: "İstanbul",
        country: "TR",
      },
    });
    await makeListing(prisma, {
      companyId: buyer.company.id,
      createdById: buyer.user.id,
      type: "ALIM",
      status: "OPEN",
      closesAt: FUTURE,
      deliveryAddressId: addr.id,
    });
    return { buyer, addr };
  }

  const dto = (over: Record<string, unknown> = {}) => ({
    type: "TESLIMAT",
    title: "Depo",
    addressLine: "Örnek mah. No:1",
    city: "İstanbul",
    country: "TR",
    ...over,
  });

  it("aktif ilanda kullanılan adresin İLİ değiştirilemez", async () => {
    const { buyer, addr } = await setupAddressInOpenListing();
    await expect(
      svc().update(buyer.auth, addr.id, dto({ city: "Erzurum" }) as never),
    ).rejects.toThrow(/aktif ilanda kullanılıyor/);
    const row = await prisma.companyAddress.findUniqueOrThrow({
      where: { id: addr.id },
    });
    expect(row.city).toBe("İstanbul");
  });

  it("açık adres satırı da değiştirilemez", async () => {
    const { buyer, addr } = await setupAddressInOpenListing();
    await expect(
      svc().update(
        buyer.auth,
        addr.id,
        dto({ addressLine: "Bambaşka cad. No:99" }) as never,
      ),
    ).rejects.toThrow(/aktif ilanda kullanılıyor/);
  });

  it("iletişim alanları (başlık/ilgili kişi/telefon) SERBEST kalır", async () => {
    const { buyer, addr } = await setupAddressInOpenListing();
    await expect(
      svc().update(
        buyer.auth,
        addr.id,
        dto({ title: "Merkez Depo", contactName: "Ayşe", phone: "+90 555" }) as never,
      ),
    ).resolves.toMatchObject({ title: "Merkez Depo" });
  });

  it("kullanımda OLMAYAN adres serbestçe taşınabilir (pozitif kontrol)", async () => {
    const co = await makeCompanyWithUser(prisma, { country: "TR" });
    const addr = await prisma.companyAddress.create({
      data: {
        companyId: co.company.id,
        type: "TESLIMAT",
        title: "Depo",
        addressLine: "Eski",
        city: "İstanbul",
        country: "TR",
      },
    });
    await expect(
      svc().update(co.auth, addr.id, dto({ city: "Ankara", addressLine: "Yeni" }) as never),
    ).resolves.toMatchObject({ city: "Ankara" });
  });
});

// ──────────────────── 3+4. İhale belgeleri (düzenleme + görünürlük) ────────────────────

describe("ihale belgeleri — kilit updateListing ile birebir", () => {
  const svc = () =>
    new CompanyListingDocumentsService(
      prisma as never,
      storageMock() as never,
      new CompanyBlocksService(prisma as never, new AuditService(prisma as never)) as never,
    );

  it("TASLAK teklif kaydı bile belge değişikliğini kilitler (SUBMITTED şartı değil)", async () => {
    const buyer = await makeCompanyWithUser(prisma, { country: "TR" });
    const supplier = await makeCompanyWithUser(prisma, { country: "TR" });
    const listing = await makeListing(prisma, {
      companyId: buyer.company.id,
      createdById: buyer.user.id,
      type: "ALIM",
      status: "OPEN",
      closesAt: FUTURE,
    });
    const item = await makeItem(prisma, listing.id);
    await makeBid(prisma, {
      listingId: listing.id,
      bidderCompanyId: supplier.company.id,
      createdById: supplier.user.id,
      amount: 100,
      status: "DRAFT",
      items: [{ itemId: item.id, unitPrice: 100 }],
    });
    await expect(
      svc().requestUploadUrl(buyer.auth, listing.id, {
        fileName: "sartname.pdf",
        mimeType: "application/pdf",
      }),
    ).rejects.toThrow(/teklif verilmiş; belgeler değiştirilemez/);
  });

  it("ELENEN (LOST) teklif de kilitler — arka kapı kapalı", async () => {
    const buyer = await makeCompanyWithUser(prisma, { country: "TR" });
    const supplier = await makeCompanyWithUser(prisma, { country: "TR" });
    const listing = await makeListing(prisma, {
      companyId: buyer.company.id,
      createdById: buyer.user.id,
      type: "ALIM",
      status: "OPEN",
      closesAt: FUTURE,
    });
    const item = await makeItem(prisma, listing.id);
    await makeBid(prisma, {
      listingId: listing.id,
      bidderCompanyId: supplier.company.id,
      createdById: supplier.user.id,
      amount: 100,
      status: "LOST",
      items: [{ itemId: item.id, unitPrice: 100 }],
    });
    await expect(
      svc().requestUploadUrl(buyer.auth, listing.id, {
        fileName: "sartname.pdf",
        mimeType: "application/pdf",
      }),
    ).rejects.toThrow(/teklif verilmiş; belgeler değiştirilemez/);
  });

  it("teklifsiz OPEN ilanda belge eklenebilir (pozitif kontrol)", async () => {
    const buyer = await makeCompanyWithUser(prisma, { country: "TR" });
    const listing = await makeListing(prisma, {
      companyId: buyer.company.id,
      createdById: buyer.user.id,
      type: "ALIM",
      status: "OPEN",
      closesAt: FUTURE,
    });
    await expect(
      svc().requestUploadUrl(buyer.auth, listing.id, {
        fileName: "sartname.pdf",
        mimeType: "application/pdf",
      }),
    ).resolves.toMatchObject({ url: expect.any(String) });
  });
});

describe("taslak/embargolu ilanın belgeleri indirilemez (getOne aynası)", () => {
  const svc = () =>
    new CompanyListingDocumentsService(
      prisma as never,
      storageMock() as never,
      new CompanyBlocksService(prisma as never, new AuditService(prisma as never)) as never,
    );

  async function setup(over: Record<string, unknown>) {
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const other = await makeCompanyWithUser(prisma, { country: "TR" });
    await connect(prisma, owner.company.id, other.company.id, owner.user.id);
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      visibility: "PUBLIC",
      closesAt: FUTURE,
      ...over,
    });
    return { owner, other, listing };
  }

  it("DRAFT ilanın belgeleri sahibi dışında 404", async () => {
    const { owner, other, listing } = await setup({ status: "DRAFT" });
    await expect(svc().list(other.auth, listing.id)).rejects.toThrow(
      /İlan bulunamadı/,
    );
    // Sahip görebilir.
    await expect(svc().list(owner.auth, listing.id)).resolves.toEqual([]);
  });

  it("açılışı GELECEKTE olan ilanın belgeleri teklifi olmayana 404", async () => {
    const { other, listing } = await setup({
      status: "OPEN",
      bidsOpenAt: FUTURE,
    });
    await expect(svc().list(other.auth, listing.id)).rejects.toThrow(
      /İlan bulunamadı/,
    );
  });

  it("önceki turun katılımcısı (teklifi olan) embargoda da görebilir", async () => {
    const { other, listing } = await setup({
      status: "OPEN",
      bidsOpenAt: FUTURE,
    });
    const item = await makeItem(prisma, listing.id);
    await makeBid(prisma, {
      listingId: listing.id,
      bidderCompanyId: other.company.id,
      createdById: other.user.id,
      amount: 50,
      status: "SUBMITTED",
      items: [{ itemId: item.id, unitPrice: 50 }],
    });
    await expect(svc().list(other.auth, listing.id)).resolves.toEqual([]);
  });
});

// ───────────────────────── 5. Sipariş belgeleri ─────────────────────────

describe("sipariş belgesi — etki doğduktan sonra silinemez", () => {
  const svc = () =>
    new CompanyOrderDocumentsService(prisma as never, storageMock() as never);

  async function order(
    status: string,
    docType: string,
    over: Record<string, unknown> = {},
  ) {
    const seller = await makeCompanyWithUser(prisma, { country: "TR" });
    const buyer = await makeCompanyWithUser(prisma, { country: "TR" });
    const o = await prisma.companyOrder.create({
      data: {
        sellerCompanyId: seller.company.id,
        buyerCompanyId: buyer.company.id,
        amount: 1000,
        status: status as never,
        ...over,
      },
    });
    const uploader = docType === "PAYMENT" ? buyer : seller;
    const doc = await prisma.companyOrderDocument.create({
      data: {
        orderId: o.id,
        type: docType as never,
        key: `orders/${o.id}/x.pdf`,
        fileName: "x.pdf",
        mimeType: "application/pdf",
        uploadedByCompanyId: uploader.company.id,
      },
    });
    return { seller, buyer, o, doc, uploader };
  }

  it("onaylanmış ödemenin dekontu silinemez", async () => {
    const { buyer, o, doc } = await order("IN_DELIVERY", "PAYMENT");
    await prisma.companyOrderPayment.create({
      data: {
        orderId: o.id,
        amount: 1000,
        status: "CONFIRMED",
        recordedByCompanyId: buyer.company.id,
      },
    });
    await expect(svc().remove(buyer.auth, o.id, doc.id)).rejects.toThrow(
      /Onaylanmış ödemenin dekontu/,
    );
    expect(
      await prisma.companyOrderDocument.count({ where: { id: doc.id } }),
    ).toBe(1);
  });

  it("ödeme henüz onaylanmadıysa dekont silinebilir (yanlış yükleme düzeltmesi)", async () => {
    const { buyer, o, doc } = await order("IN_DELIVERY", "PAYMENT");
    await expect(svc().remove(buyer.auth, o.id, doc.id)).resolves.toEqual({
      ok: true,
    });
  });

  it("akreditif açıldı damgalandıysa küşat mektubu silinemez", async () => {
    const { seller, o, doc } = await order("ACCEPTED", "LC", {
      lcOpenedAt: new Date(),
    });
    // LC belgesini alıcı yükler; burada yükleyen satıcı olduğu için kendi
    // belgesini silmeye çalışıyor — evre kilidi rolden ÖNCE test edilir.
    await expect(svc().remove(seller.auth, o.id, doc.id)).rejects.toThrow(
      /akreditif açıldı işaretlendikten sonra silinemez/,
    );
  });

  it("teslim onaylandıysa irsaliye silinemez", async () => {
    const { seller, o, doc } = await order("DELIVERED", "DELIVERY");
    await expect(svc().remove(seller.auth, o.id, doc.id)).rejects.toThrow(
      /teslimat onaylandıktan sonra silinemez/,
    );
  });

  it("sonlanmış siparişin hiçbir belgesi silinemez", async () => {
    const { seller, o, doc } = await order("COMPLETED", "INVOICE");
    await expect(svc().remove(seller.auth, o.id, doc.id)).rejects.toThrow(
      /Sonlanmış siparişin belgeleri/,
    );
  });

  it("TEMINAT onaydan sonra silinemez (mevcut kural korunur)", async () => {
    const { seller, o, doc } = await order("ACCEPTED", "TEMINAT");
    await expect(svc().remove(seller.auth, o.id, doc.id)).rejects.toThrow(
      /sipariş onaylandıktan sonra silinemez/,
    );
  });
});
