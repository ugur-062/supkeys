/**
 * Satış ihalesi (SATIS) — sihirbaz akışı backend'i: oluşturma (taban/hemen-al +
 * kalemler + alıcı davetleri), taban fiyat teklif tabanı, hemen-al.
 */
import { prisma, truncateAll } from "./test-db";
import { connect, makeCompanyWithUser } from "./factories";
import { makeService } from "./make-service";

const future = (days: number) => new Date(Date.now() + days * 86_400_000);
const bidBase = {
  deliveryDate: future(7).toISOString(),
  validityDays: 30,
};

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

async function sellerAndBuyer() {
  const { service } = makeService();
  const seller = await makeCompanyWithUser(prisma, { country: "TR" });
  const buyer = await makeCompanyWithUser(prisma, { country: "TR" });
  await connect(prisma, seller.company.id, buyer.company.id, seller.user.id);
  return { service, seller, buyer };
}

const satisDto = (over: Record<string, unknown> = {}) => ({
  type: "SATIS",
  format: "RFQ",
  isInternational: false,
  visibility: "CONNECTIONS",
  title: "Hurda bakır satışı",
  closesAt: future(3).toISOString(),
  minPrice: 1000,
  buyNowPrice: 5000,
  items: [
    { name: "Bakır hurda", quantity: 10, unit: "ton" },
  ],
  ...over,
});

describe("SATIS ihale oluşturma (sihirbaz backend'i)", () => {
  it("taban + hemen-al + kalemler + davetlerle yayınlanır", async () => {
    const { service, seller, buyer } = await sellerAndBuyer();
    // Factory rothernId üretmez — davet çözümü kod ister (K7X9-3M2P formatı).
    const buyerCode = "K7X9-3M2P";
    await prisma.company.update({
      where: { id: buyer.company.id },
      data: { rothernId: buyerCode },
    });

    const listing = await service.create(
      seller.auth,
      satisDto({ invitations: [buyerCode] }) as never,
    );
    expect(listing.status).toBe("OPEN");

    const db = await prisma.listing.findUniqueOrThrow({
      where: { id: listing.id },
      include: { items: true, invitations: true },
    });
    expect(db.type).toBe("SATIS");
    expect(Number(db.minPrice)).toBe(1000);
    expect(Number(db.buyNowPrice)).toBe(5000);
    expect(db.format).toBe("RFQ");
    expect(db.items).toHaveLength(1);
    expect(db.invitations).toHaveLength(1);
  });

  it("taban fiyatsız, formatsız veya hemen-al < taban reddedilir", async () => {
    const { service, seller } = await sellerAndBuyer();
    await expect(
      service.create(seller.auth, satisDto({ minPrice: undefined }) as never),
    ).rejects.toThrow(/taban fiyat/i);
    await expect(
      service.create(seller.auth, satisDto({ format: undefined }) as never),
    ).rejects.toThrow(/format seçin/i);
    await expect(
      service.create(
        seller.auth,
        satisDto({ minPrice: 1000, buyNowPrice: 500 }) as never,
      ),
    ).rejects.toThrow(/taban fiyattan büyük olmalı/);
  });
});

describe("SATIS teklif — taban fiyat tabanı", () => {
  it("taban altı GÖNDERİM reddedilir; taslak serbest; taban üstü kabul", async () => {
    const { service, seller, buyer } = await sellerAndBuyer();
    const listing = await service.create(seller.auth, satisDto() as never);

    // Kalemli ilan: alıcı kaleme birim fiyat verir (10 ton × 50 = 500 < 1000 taban).
    const items = await prisma.listingItem.findMany({
      where: { listingId: listing.id },
      select: { id: true },
    });
    await expect(
      service.placeBid(buyer.auth, listing.id, {
        items: [{ itemId: items[0].id, unitPrice: 50 }],
        ...bidBase,
      } as never),
    ).rejects.toThrow(/taban fiyatın .* altında olamaz/);

    // Taslak serbest.
    const draft = await service.placeBid(buyer.auth, listing.id, {
      items: [{ itemId: items[0].id, unitPrice: 50 }],
      asDraft: true,
      ...bidBase,
    } as never);
    expect(draft.status).toBe("DRAFT");

    // Taban üstü kabul (10 × 150 = 1500).
    const ok = await service.placeBid(buyer.auth, listing.id, {
      items: [{ itemId: items[0].id, unitPrice: 150 }],
      ...bidBase,
    } as never);
    expect(ok.status).toBe("SUBMITTED");
  });

  it("hemen-al taban kuralından bağımsız çalışır (buyNowPrice ≥ taban zaten)", async () => {
    const { service, seller, buyer } = await sellerAndBuyer();
    const listing = await service.create(seller.auth, satisDto() as never);
    const res = await service.buyNow(buyer.auth, listing.id, {
      deliveryDate: future(7).toISOString(),
      validityDays: 30,
    });
    expect(Number(res.amount)).toBe(5000);
  });
});

describe("SATIS kalem bazlı fiyatlandırma — oluşturma", () => {
  it("kalem tabansız reddedilir; hemen-al < taban reddedilir; geçerli KALEM yayınlanır", async () => {
    const { service, seller } = await sellerAndBuyer();

    await expect(
      service.create(
        seller.auth,
        satisDto({
          priceScope: "KALEM",
          minPrice: undefined,
          buyNowPrice: undefined,
          items: [{ name: "Bakır", quantity: 1, unit: "ton" }],
        }) as never,
      ),
    ).rejects.toThrow(/taban birim fiyat girin/);

    await expect(
      service.create(
        seller.auth,
        satisDto({
          priceScope: "KALEM",
          minPrice: undefined,
          buyNowPrice: undefined,
          items: [
            {
              name: "Bakır",
              quantity: 1,
              unit: "ton",
              minUnitPrice: 100,
              buyNowUnitPrice: 50,
            },
          ],
        }) as never,
      ),
    ).rejects.toThrow(/taban fiyattan büyük olmalı/);

    const listing = await service.create(
      seller.auth,
      satisDto({
        priceScope: "KALEM",
        minPrice: undefined,
        buyNowPrice: undefined,
        items: [
          {
            name: "Bakır",
            quantity: 1,
            unit: "ton",
            minUnitPrice: 100,
            buyNowUnitPrice: 150,
          },
        ],
      }) as never,
    );
    const db = await prisma.listing.findUniqueOrThrow({
      where: { id: listing.id },
      include: { items: true },
    });
    expect(db.priceScope).toBe("KALEM");
    expect(db.minPrice).toBeNull(); // ilan geneli fiyat KALEM'de yazılmaz
    expect(Number(db.items[0]!.minUnitPrice)).toBe(100);
    expect(Number(db.items[0]!.buyNowUnitPrice)).toBe(150);
  });
});
