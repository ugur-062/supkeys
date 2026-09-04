/**
 * Madde 9 (2026-08-02) — kalem bazlı para birimi: teklif kalemi ilanın izin
 * verdiği birimlerden, teklifin ana biriminden farklı bir birim taşıyabilir.
 * Sözleşme: (1) bid.amount ANA BİRİMDE Σ (kayıtlı fxToBase damgasıyla,
 * satır-başı 2 hane yuvarlama); (2) award'da para birimi başına AYRI sipariş
 * (sipariş tutarı KENDİ biriminde, çevrimsiz kesin Σ); (3) yalnız kapalı zarf
 * ALIM — açık eksiltme reddeder; (4) kur alınamazsa fail-closed.
 */
import { prisma, truncateAll } from "./test-db";
import { makeCompanyWithUser, makeItem, makeListing } from "./factories";
import { makeService } from "./make-service";

const FUTURE = new Date(Date.now() + 7 * 24 * 3600 * 1000);

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

async function setup(listingOver: Record<string, unknown> = {}) {
  const { service, ...mocks } = makeService();
  const owner = await makeCompanyWithUser(prisma, { country: "TR" });
  const bidder = await makeCompanyWithUser(prisma, { country: "TR" });
  const listing = await makeListing(prisma, {
    companyId: owner.company.id,
    createdById: owner.user.id,
    type: "ALIM",
    status: "OPEN",
    visibility: "PUBLIC",
    closesAt: FUTURE,
    primaryCurrency: "TRY",
    allowedCurrencies: ["TRY", "EUR"],
    ...listingOver,
  } as never);
  // Kalem 1: 2 adet — TRY; Kalem 2: 3 adet — EUR teklif edilecek.
  const item1 = await makeItem(prisma, listing.id, {
    name: "Yerli kalem",
    quantity: 2,
  } as never);
  const item2 = await makeItem(prisma, listing.id, {
    name: "İthal kalem",
    quantity: 3,
  } as never);
  return { service, mocks, owner, bidder, listing, item1, item2 };
}

const bidBase = { validityDays: 30, deliveryTime: "W1_2" };

describe("kalem bazlı para birimi — placeBid", () => {
  it("karma teklif: amount ana birimde Σ (kayıtlı kur damgasıyla); kalem currency+fxToBase kalıcı", async () => {
    const { service, mocks, bidder, listing, item1, item2 } = await setup();
    // EUR→TRY = 48 (TCMB taze kur stub'ı); baz TRY=1 → fxToBase(EUR)=48.
    mocks.exchangeRates.getFreshRate.mockImplementation(
      async (c: string) => (c === "EUR" ? 48 : 34),
    );

    await service.placeBid(bidder.auth, listing.id, {
      ...bidBase,
      items: [
        { itemId: item1.id, unitPrice: 100 }, // 100×2 = 200 TRY
        { itemId: item2.id, unitPrice: 10, currency: "EUR" }, // 10×3×48 = 1440 TRY
      ],
    } as never);

    const bid = await prisma.listingBid.findFirstOrThrow({
      where: { listingId: listing.id, bidderCompanyId: bidder.company.id },
      include: { items: true },
    });
    expect(bid.status).toBe("SUBMITTED");
    expect(bid.currency).toBe("TRY");
    expect(bid.amount.toString()).toBe("1640");
    const eurRow = bid.items.find((i) => i.itemId === item2.id)!;
    expect(eurRow.currency).toBe("EUR");
    expect(Number(eurRow.fxToBase)).toBe(48);
    const tryRow = bid.items.find((i) => i.itemId === item1.id)!;
    expect(tryRow.currency).toBeNull();
    expect(tryRow.fxToBase).toBeNull();
  });

  it("kur alınamazsa FAIL-CLOSED reddedilir; açık eksiltmede kalem birimi yasak", async () => {
    const { service, mocks, bidder, listing, item1, item2 } = await setup();
    mocks.exchangeRates.getFreshRate.mockRejectedValue(new Error("TCMB down"));
    await expect(
      service.placeBid(bidder.auth, listing.id, {
        ...bidBase,
        items: [
          { itemId: item1.id, unitPrice: 100 },
          { itemId: item2.id, unitPrice: 10, currency: "EUR" },
        ],
      } as never),
    ).rejects.toThrow(/Güncel kur bilgisi yok/);

    // Açık eksiltmede tek-birim kilidi korunur.
    const auction = await setup({ format: "ENGLISH_AUCTION" });
    await expect(
      auction.service.placeBid(auction.bidder.auth, auction.listing.id, {
        ...bidBase,
        items: [
          { itemId: auction.item1.id, unitPrice: 100 },
          { itemId: auction.item2.id, unitPrice: 10, currency: "EUR" },
        ],
      } as never),
    ).rejects.toThrow(/kapalı zarf alım/);

    // İlanın izin vermediği birim reddedilir.
    const strict = await setup({ allowedCurrencies: ["TRY", "USD"] });
    strict.mocks.exchangeRates.getFreshRate.mockResolvedValue(40);
    await expect(
      strict.service.placeBid(strict.bidder.auth, strict.listing.id, {
        ...bidBase,
        items: [
          { itemId: strict.item1.id, unitPrice: 100 },
          { itemId: strict.item2.id, unitPrice: 10, currency: "EUR" },
        ],
      } as never),
    ).rejects.toThrow(/geçersiz kalem para birimi/i);
  });
});

describe("kalem bazlı para birimi — award: para birimi başına AYRI sipariş", () => {
  it("karma kazanan teklif → TRY ve EUR siparişleri (tutarlar kendi biriminde, çevrimsiz)", async () => {
    const { service, mocks, owner, bidder, listing, item1, item2 } =
      await setup();
    mocks.exchangeRates.getFreshRate.mockImplementation(
      async (c: string) => (c === "EUR" ? 48 : 34),
    );
    await service.placeBid(bidder.auth, listing.id, {
      ...bidBase,
      items: [
        { itemId: item1.id, unitPrice: 100 },
        { itemId: item2.id, unitPrice: 10, currency: "EUR" },
      ],
    } as never);
    const bid = await prisma.listingBid.findFirstOrThrow({
      where: { listingId: listing.id, bidderCompanyId: bidder.company.id },
    });

    const res = (await service.award(owner.auth, listing.id, bid.id)) as {
      orders?: { id: string; number: string | null }[];
    };
    const orders = await prisma.companyOrder.findMany({
      where: { listingId: listing.id },
      include: { items: true },
      orderBy: { currency: "asc" },
    });
    expect(orders).toHaveLength(2);
    const eurOrder = orders.find((o) => o.currency === "EUR")!;
    const tryOrder = orders.find((o) => o.currency === "TRY")!;
    // EUR siparişi: 10×3 = 30 EUR (çevrimsiz, kendi biriminde kesin Σ).
    expect(eurOrder.amount.toString()).toBe("30");
    expect(eurOrder.items).toHaveLength(1);
    expect(eurOrder.items[0]!.name).toBe("İthal kalem");
    // TRY siparişi: 100×2 = 200 TRY.
    expect(tryOrder.amount.toString()).toBe("200");
    expect(tryOrder.items[0]!.name).toBe("Yerli kalem");
    // Her iki sipariş de aynı taraflarla (ALIM: teklifçi satıcı).
    expect(eurOrder.sellerCompanyId).toBe(bidder.company.id);
    expect(tryOrder.sellerCompanyId).toBe(bidder.company.id);
    expect(eurOrder.buyerCompanyId).toBe(owner.company.id);
    // Teklif WON, ilan AWARDED; API cevabı tüm siparişleri döndürür.
    const b = await prisma.listingBid.findUniqueOrThrow({
      where: { id: bid.id },
    });
    expect(b.status).toBe("WON");
    if (res.orders) expect(res.orders).toHaveLength(2);
  });
});
