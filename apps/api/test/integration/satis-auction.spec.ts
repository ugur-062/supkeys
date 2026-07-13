/**
 * SATIS + açık artırma (pazarlık) — yön-farkında kurallar (2026-07-13 seti):
 * fiyat YÜKSELİR (kendi öncekinden kesin yüksek; minimum artış payı YOK),
 * turda tek aktif gönderim, taban fiyat ilk teklif tabanı, hemen-al tavanı,
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
  bidVisibility: "BEST_PRICE",
  // Miktar 1 → toplam teklif = birim fiyat (adım matematiği okunur kalsın).
  items: [{ name: "Bakır hurda", quantity: 1, unit: "ton" }],
  ...over,
});

const rfqDto = (over: Record<string, unknown> = {}) =>
  auctionDto({
    format: "RFQ",
    ...over,
  });

/** Açık artırmaya tek meşru yol: RFQ (teklif toplama) aç → "Yeni Tur" ile
 *  aktar — doğrudan ENGLISH_AUCTION create artık reddedilir. */
async function createAuction(
  service: ReturnType<typeof makeService>["service"],
  auth: { companyId: string; userId: string },
  createOver: Record<string, unknown> = {},
  roundOver: Record<string, unknown> = {},
) {
  const l = await service.create(auth as never, rfqDto(createOver) as never);
  await service.createNextRound(auth as never, l.id, {
    type: "ENGLISH_AUCTION",
    carryBids: "NONE",
    closesAt: future(3).toISOString(),
    bidVisibility: "BEST_PRICE",
    ...roundOver,
  } as never);
  return l;
}

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
  it("doğrudan açılamaz; 'Yeni Tur' aktarması PAYSIZ açılır (minimum pay kaldırıldı)", async () => {
    const { service, seller } = await sellerAndBuyers();
    // Doğrudan create yasak — tek yol RFQ sonrası aktarma.
    await expect(
      service.create(seller.auth, auctionDto() as never),
    ).rejects.toThrow(/doğrudan açılamaz/);

    const listing = await service.create(seller.auth, rfqDto() as never);
    expect(listing.status).toBe("OPEN");

    // Pay alanı olmadan aktarma GEÇERLİ (eskiden "artış adımı zorunlu" idi).
    await service.createNextRound(seller.auth as never, listing.id, {
      type: "ENGLISH_AUCTION",
      carryBids: "NONE",
      closesAt: future(3).toISOString(),
      bidVisibility: "BEST_PRICE",
    } as never);
    const db = await prisma.listing.findUniqueOrThrow({
      where: { id: listing.id },
    });
    expect(db.status).toBe("OPEN");
    expect(db.format).toBe("ENGLISH_AUCTION");
    // Taban fiyat aktarımda korunur; pay yapılandırması boş.
    expect(Number(db.minPrice)).toBe(1000);
    expect(db.priceDecrementValue).toBeNull();
  });
});

describe("SATIS açık artırma — teklif kuralları", () => {
  it("fiyat serbest: rakibi geçme şartı YOK, turda tek gönderim VAR", async () => {
    const { service, seller, b1, b2 } = await sellerAndBuyers();
    const l = await createAuction(service, seller.auth);

    // İlk teklif: referans yok, taban (1000) yeterli.
    const first = await bid(service, b1.auth, l.id, 1000);
    expect(first.status).toBe("SUBMITTED");

    // Rakip en iyinin ÜZERİNE çıkmak zorunda değil (kazandırma manuel) —
    // 1050 kabul edilir; minimum artış payı da yok.
    const second = await bid(service, b2.auth, l.id, 1050);
    expect(second.status).toBe("SUBMITTED");

    // b1'in tur hakkı doldu (ilk gönderimde kullanıldı).
    await expect(bid(service, b1.auth, l.id, 1200)).rejects.toThrow(
      /bu turdaki teklifinizi verdiniz/i,
    );
  });

  it("monotonik artış: taşınan teklifin altına inilemez, kesin üstü kabul", async () => {
    const { service, seller, b1 } = await sellerAndBuyers();
    // Taban düşük tutulur ki 900'lük deneme taban kontrolüne değil
    // monotonluk kuralına takılsın.
    const l = await createAuction(service, seller.auth, { minPrice: 100 });
    // Taşınan teklif simülasyonu: hak yakmamış SUBMITTED teklif.
    const listing = await prisma.listing.findUniqueOrThrow({
      where: { id: l.id },
      select: { currentRound: true },
    });
    const item = await prisma.listingItem.findFirstOrThrow({
      where: { listingId: l.id },
      select: { id: true },
    });
    await prisma.listingBid.create({
      data: {
        listingId: l.id,
        bidderCompanyId: b1.company.id,
        createdById: b1.user.id,
        amount: 1000,
        status: "SUBMITTED",
        submittedAt: new Date(),
        round: listing.currentRound,
        activeBidRound: listing.currentRound - 1, // önceki turun aktifi
        items: { create: [{ itemId: item.id, unitPrice: 1000 }] },
      },
    });
    await expect(bid(service, b1.auth, l.id, 900)).rejects.toThrow(
      /önceki teklifinizin .* üzerinde olmalı/,
    );
    await expect(bid(service, b1.auth, l.id, 1000)).rejects.toThrow(
      /önceki teklifinizin .* üzerinde olmalı/,
    );
    // Minimum artış yok — 1 ₺ üstü bile geçerli.
    const ok = await bid(service, b1.auth, l.id, 1001);
    expect(ok.status).toBe("SUBMITTED");
  });

  it("taban altı ilk teklif reddedilir (artırmada da taban geçerli)", async () => {
    const { service, seller, b1 } = await sellerAndBuyers();
    const l = await createAuction(service, seller.auth);
    await expect(bid(service, b1.auth, l.id, 900)).rejects.toThrow(
      /taban fiyatın .* altında olamaz/,
    );
  });

  it("hemen-al tavanı: tavana eşit/üstü teklif reddedilir, Hemen Al çalışır", async () => {
    const { service, seller, b1, b2 } = await sellerAndBuyers();
    const l = await createAuction(service, seller.auth);
    await expect(bid(service, b1.auth, l.id, 5000)).rejects.toThrow(
      /Hemen Al/,
    );
    const ok = await bid(service, b1.auth, l.id, 4900);
    expect(ok.status).toBe("SUBMITTED");

    const bn = await service.buyNow(b2.auth, l.id, {
      deliveryDate: future(7).toISOString(),
      validityDays: 30,
    });
    expect(Number(bn.amount)).toBe(5000);
  });

  it("en iyi teklif = EN YÜKSEK: getOne currentBest artırmada max döner", async () => {
    const { service, seller, b1, b2 } = await sellerAndBuyers();
    const l = await createAuction(service, seller.auth);
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
