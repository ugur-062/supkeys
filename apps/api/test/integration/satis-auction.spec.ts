/**
 * SATIS + İngiliz Usulü AÇIK ARTIRMA — yön-farkında kurallar:
 * fiyat YÜKSELİR (referans + artış adımı tabanı), kendi teklifinin altına
 * inilemez (monotonik artış), taban fiyat ilk teklif tabanı, hemen-al tavanı,
 * en iyi teklif = EN YÜKSEK.
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

async function sellerAndBuyers() {
  const { service } = makeService();
  const seller = await makeCompanyWithUser(prisma, { country: "TR" });
  const b1 = await makeCompanyWithUser(prisma, { country: "TR" });
  const b2 = await makeCompanyWithUser(prisma, { country: "TR" });
  await connect(prisma, seller.company.id, b1.company.id, seller.user.id);
  await connect(prisma, seller.company.id, b2.company.id, seller.user.id);
  return { service, seller, b1, b2 };
}

const auctionDto = (over: Record<string, unknown> = {}) => ({
  type: "SATIS",
  format: "ENGLISH_AUCTION",
  isInternational: false,
  visibility: "CONNECTIONS",
  title: "Hurda bakır — açık artırma",
  closesAt: future(3).toISOString(),
  minPrice: 1000,
  buyNowPrice: 5000,
  priceDecrementType: "AMOUNT",
  priceDecrementValue: 100,
  priceDecrementBasis: "BEST_BID",
  bidVisibility: "BEST_PRICE",
  // Miktar 1 → toplam teklif = birim fiyat (adım matematiği okunur kalsın).
  items: [{ name: "Bakır hurda", quantity: 1, unit: "ton" }],
  ...over,
});

/** Kalemli ilanda toplam `total` olacak şekilde teklif verir (miktar 1). */
async function bid(
  service: ReturnType<typeof makeService>["service"],
  auth: { companyId: string; userId: string },
  listingId: string,
  total: number,
  extra: Record<string, unknown> = {},
) {
  const items = await prisma.listingItem.findMany({
    where: { listingId },
    select: { id: true },
  });
  return service.placeBid(auth as never, listingId, {
    items: [{ itemId: items[0].id, unitPrice: total }],
    ...bidBase,
    ...extra,
  } as never);
}

describe("SATIS açık artırma — oluşturma", () => {
  it("artış adımsız reddedilir; adımlıyla yayınlanır (format kaydedilir)", async () => {
    const { service, seller } = await sellerAndBuyers();
    await expect(
      service.create(
        seller.auth,
        auctionDto({ priceDecrementValue: undefined }) as never,
      ),
    ).rejects.toThrow(/artış adımı zorunlu/);

    const listing = await service.create(seller.auth, auctionDto() as never);
    expect(listing.status).toBe("OPEN");
    const db = await prisma.listing.findUniqueOrThrow({
      where: { id: listing.id },
    });
    expect(db.format).toBe("ENGLISH_AUCTION");
    expect(Number(db.minPrice)).toBe(1000);
  });
});

describe("SATIS açık artırma — teklif kuralları", () => {
  it("fiyat yükselir: referansın en az artış adımı kadar ÜZERİNE çıkılmalı", async () => {
    const { service, seller, b1, b2 } = await sellerAndBuyers();
    const l = await service.create(seller.auth, auctionDto() as never);

    // İlk teklif: referans yok, taban (1000) yeterli.
    const first = await bid(service, b1.auth, l.id, 1000);
    expect(first.status).toBe("SUBMITTED");

    // Rakip 1050 veremez (en iyi 1000 + adım 100 = 1100 tabanı).
    await expect(bid(service, b2.auth, l.id, 1050)).rejects.toThrow(
      /Açık artırma: teklifiniz en az/,
    );
    const second = await bid(service, b2.auth, l.id, 1100);
    expect(second.status).toBe("SUBMITTED");

    // b1 yeni teklifi: referans artık 1100 → 1150 yetmez, 1200 geçer.
    await expect(bid(service, b1.auth, l.id, 1150)).rejects.toThrow(
      /Açık artırma: teklifiniz en az/,
    );
    const third = await bid(service, b1.auth, l.id, 1200);
    expect(third.status).toBe("SUBMITTED");
  });

  it("monotonik artış: kendi teklifinin altına inilemez (OWN_LAST_BID bazında bile)", async () => {
    const { service, seller, b1 } = await sellerAndBuyers();
    // Taban düşük tutulur ki 900'lük deneme taban kontrolüne değil
    // monotonluk kuralına takılsın.
    const l = await service.create(
      seller.auth,
      auctionDto({ priceDecrementBasis: "OWN_LAST_BID", minPrice: 100 }) as never,
    );
    await bid(service, b1.auth, l.id, 1000);
    await expect(bid(service, b1.auth, l.id, 900)).rejects.toThrow(
      /önceki teklifinizin .* üzerinde olmalı/,
    );
    // Kendi son teklifi + adım.
    await expect(bid(service, b1.auth, l.id, 1050)).rejects.toThrow(
      /en az/,
    );
    const ok = await bid(service, b1.auth, l.id, 1100);
    expect(ok.status).toBe("SUBMITTED");
  });

  it("taban altı ilk teklif reddedilir (artırmada da taban geçerli)", async () => {
    const { service, seller, b1 } = await sellerAndBuyers();
    const l = await service.create(seller.auth, auctionDto() as never);
    await expect(bid(service, b1.auth, l.id, 900)).rejects.toThrow(
      /taban fiyatın .* altında olamaz/,
    );
  });

  it("hemen-al tavanı: tavana eşit/üstü teklif reddedilir, Hemen Al çalışır", async () => {
    const { service, seller, b1, b2 } = await sellerAndBuyers();
    const l = await service.create(seller.auth, auctionDto() as never);
    await expect(bid(service, b1.auth, l.id, 5000)).rejects.toThrow(
      /Hemen Al/,
    );
    const ok = await bid(service, b1.auth, l.id, 4900);
    expect(ok.status).toBe("SUBMITTED");

    const bn = await service.buyNow(b2.auth, l.id);
    expect(Number(bn.amount)).toBe(5000);
  });

  it("en iyi teklif = EN YÜKSEK: getOne currentBest artırmada max döner", async () => {
    const { service, seller, b1, b2 } = await sellerAndBuyers();
    const l = await service.create(seller.auth, auctionDto() as never);
    await bid(service, b1.auth, l.id, 1000);
    await bid(service, b2.auth, l.id, 1100);

    const forB1 = (await service.getOne(b1.auth, l.id)) as {
      english: { currentBest: string | null } | null;
    };
    expect(Number(forB1.english?.currentBest)).toBe(1100);

    const forOwner = (await service.getOne(seller.auth, l.id)) as {
      english: { currentBest: string | null } | null;
    };
    expect(Number(forOwner.english?.currentBest)).toBe(1100);
  });
});
