/**
 * buyNow (Hemen-Al) — SATIS ilanında tavan fiyattan teklif. Kapılar: tip,
 * ülke (F2), kapanış (F3). Direkt sipariş DEĞİL — isBuyNow bayraklı teklif.
 */
import { prisma, truncateAll } from "./test-db";
import { makeCompanyWithUser, makeListing } from "./factories";
import { makeService } from "./make-service";

const FUTURE = new Date(Date.now() + 7 * 24 * 3600 * 1000);
const PAST = new Date(Date.now() - 3600 * 1000);

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

const bnDetails = {
  deliveryDate: new Date(Date.now() + 7 * 86_400_000).toISOString(),
  validityDays: 30,
};

async function satisListing(over: Record<string, unknown> = {}) {
  const { service } = makeService();
  const owner = await makeCompanyWithUser(prisma, { country: "TR" });
  const buyer = await makeCompanyWithUser(prisma, { country: "TR" });
  const listing = await makeListing(prisma, {
    companyId: owner.company.id,
    createdById: owner.user.id,
    type: "SATIS",
    status: "OPEN",
    visibility: "PUBLIC",
    buyNowPrice: "5000",
    closesAt: FUTURE,
    ...over,
  });
  return { service, owner, buyer, listing };
}

describe("buyNow", () => {
  it("SATIS + buyNowPrice: isBuyNow teklif oluşturur (tutar = tavan)", async () => {
    const { service, buyer, listing } = await satisListing();
    const res = (await service.buyNow(buyer.auth, listing.id, bnDetails)) as {
      amount: string;
      status: string;
    };
    expect(res.amount).toBe("5000");
    const stored = await prisma.listingBid.findFirstOrThrow({
      where: { listingId: listing.id, bidderCompanyId: buyer.company.id },
    });
    expect(stored.isBuyNow).toBe(true);
  });

  it("ALIM ilanında hemen-al yok", async () => {
    const { service } = makeService();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const buyer = await makeCompanyWithUser(prisma, { country: "TR" });
    const alim = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      status: "OPEN",
      visibility: "PUBLIC",
      closesAt: FUTURE,
    });
    await expect(service.buyNow(buyer.auth, alim.id)).rejects.toThrow(
      /hemen-al/i,
    );
  });

  it("yanlış ülkeden hemen-al yapılamaz (F2)", async () => {
    const { service, listing } = await satisListing();
    const foreign = await makeCompanyWithUser(prisma, { country: "DE" });
    await expect(service.buyNow(foreign.auth, listing.id)).rejects.toThrow();
  });

  it("kapanış geçmişse hemen-al yapılamaz (F3)", async () => {
    const { service, buyer, listing } = await satisListing({ closesAt: PAST });
    await expect(service.buyNow(buyer.auth, listing.id)).rejects.toThrow(
      /süre|kapal/i,
    );
  });
});

describe("buyNow — mükerrer/kural korumaları + detaylar", () => {
  it("gönderilmiş Hemen-Al tekrarlanamaz; detaylar (not/teslim) bid'e yazılır", async () => {
    const { service, buyer, listing } = await satisListing();
    const delivery = new Date(Date.now() + 7 * 86_400_000).toISOString();
    const res = (await service.buyNow(buyer.auth, listing.id, {
      note: "Depodan kendim alırım",
      deliveryDate: delivery,
      validityDays: 30,
    })) as { id: string };
    const bid = await prisma.listingBid.findUniqueOrThrow({
      where: { id: res.id },
    });
    expect(bid.note).toBe("Depodan kendim alırım");
    expect(bid.deliveryDate?.toISOString()).toBe(delivery);

    // İkinci tıklama: reddedilir (çift gönderim yok, versiyon artmaz).
    await expect(
      service.buyNow(buyer.auth, listing.id, bnDetails),
    ).rejects.toThrow(/zaten gönderildi/);
    const after = await prisma.listingBid.findUniqueOrThrow({
      where: { id: res.id },
    });
    expect(after.version).toBe(bid.version);
  });

  it("geri çekilen teklif Hemen-Al ile diriltilemez", async () => {
    const { service, buyer, listing } = await satisListing();
    await service.buyNow(buyer.auth, listing.id, bnDetails);
    await service.withdrawBid(buyer.auth, listing.id);
    await expect(
      service.buyNow(buyer.auth, listing.id, bnDetails),
    ).rejects.toThrow(/yeniden verilemez/);
  });
});

describe("buyNow — detay zorunluluğu + KALEM kısmi seçim", () => {
  it("teslim tarihi/geçerlilik olmadan Hemen-Al reddedilir", async () => {
    const { service, buyer, listing } = await satisListing();
    await expect(service.buyNow(buyer.auth, listing.id)).rejects.toThrow(
      /teslim tarihi ve geçerlilik/,
    );
  });

  it("KALEM modda seçili kalemler hemen-al birim fiyatından alınır (kısmi)", async () => {
    const { service } = makeService();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const buyer = await makeCompanyWithUser(prisma, { country: "TR" });
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "SATIS",
      priceScope: "KALEM",
      status: "OPEN",
      visibility: "PUBLIC",
      closesAt: new Date(Date.now() + 3 * 86_400_000),
    });
    const i1 = await prisma.listingItem.create({
      data: {
        listingId: listing.id,
        lineNo: 1,
        name: "Bakır",
        quantity: 2,
        unit: "ton",
        minUnitPrice: 100,
        buyNowUnitPrice: 150,
      },
    });
    await prisma.listingItem.create({
      data: {
        listingId: listing.id,
        lineNo: 2,
        name: "Alüminyum",
        quantity: 1,
        unit: "ton",
        minUnitPrice: 50,
        buyNowUnitPrice: 80,
      },
    });

    // Yalnız 1. kalem seçilir → tutar = 150 × 2 = 300; bid item yazılır.
    const res = (await service.buyNow(buyer.auth, listing.id, {
      ...bnDetails,
      itemIds: [i1.id],
    })) as { id: string; amount: string };
    expect(Number(res.amount)).toBe(300);
    const bidItems = await prisma.listingBidItem.findMany({
      where: { bidId: res.id },
    });
    expect(bidItems).toHaveLength(1);
    expect(Number(bidItems[0]!.unitPrice)).toBe(150);
  });

  it("KALEM modda kalem taban/tavan teklif kuralları uygulanır", async () => {
    const { service } = makeService();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const buyer = await makeCompanyWithUser(prisma, { country: "TR" });
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "SATIS",
      priceScope: "KALEM",
      status: "OPEN",
      visibility: "PUBLIC",
      closesAt: new Date(Date.now() + 3 * 86_400_000),
    });
    const item = await prisma.listingItem.create({
      data: {
        listingId: listing.id,
        lineNo: 1,
        name: "Bakır",
        quantity: 1,
        unit: "ton",
        minUnitPrice: 100,
        buyNowUnitPrice: 200,
      },
    });

    // Kalem tabanı altı reddedilir.
    await expect(
      service.placeBid(buyer.auth, listing.id, {
        items: [{ itemId: item.id, unitPrice: 90 }],
        ...bnDetails,
      } as never),
    ).rejects.toThrow(/tabanın .* altında olamaz/);
    // Kalem hemen-al tavanına eşit/üstü reddedilir.
    await expect(
      service.placeBid(buyer.auth, listing.id, {
        items: [{ itemId: item.id, unitPrice: 200 }],
        ...bnDetails,
      } as never),
    ).rejects.toThrow(/bu kalemi Hemen Al ile alın/);
    // Aralıkta kabul.
    const ok = await service.placeBid(buyer.auth, listing.id, {
      items: [{ itemId: item.id, unitPrice: 150 }],
      ...bnDetails,
    } as never);
    expect(ok.status).toBe("SUBMITTED");
  });
});
