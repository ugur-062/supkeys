/**
 * Denetim düzeltmeleri (2026-07-02) — ihale akışı bütünlük/güvenlik kuralları:
 * eksiltme monotonluğu, create doğrulamaları, info-leak sırası, teklif durum
 * kuralları, geri çekme penceresi, tur taşıma, davetli ülke-bypass, maskeli
 * yanıt kırpma, kısmi kazanım, belge zorunluluğu.
 */
import { prisma, truncateAll } from "./test-db";
import {
  connect,
  invite,
  makeBid,
  makeCompanyWithUser,
  makeItem,
  makeListing,
} from "./factories";
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

async function pair() {
  const { service } = makeService();
  const buyer = await makeCompanyWithUser(prisma, { country: "TR" });
  const seller = await makeCompanyWithUser(prisma, { country: "TR" });
  await connect(prisma, buyer.company.id, seller.company.id, buyer.user.id);
  return { service, buyer, seller };
}

describe("İngiliz usulü — fiyat monotonluğu", () => {
  it("BEST_BID bazında lider kendi fiyatını YÜKSELTEMEZ", async () => {
    const { service, buyer, seller } = await pair();
    const rival = await makeCompanyWithUser(prisma, { country: "TR" });
    await connect(prisma, buyer.company.id, rival.company.id, buyer.user.id);
    const l = await makeListing(prisma, {
      companyId: buyer.company.id,
      createdById: buyer.user.id,
      type: "ALIM",
      visibility: "CONNECTIONS",
      format: "ENGLISH_AUCTION",
      closesAt: future(1),
      priceDecrementType: "AMOUNT",
      priceDecrementValue: 50,
      priceDecrementBasis: "BEST_BID",
    });
    // Rakip önce 1000 verir, lider 800 ile öne geçer.
    await service.placeBid(rival.auth, l.id, { amount: 1000, ...bidBase } as never);
    await service.placeBid(seller.auth, l.id, { amount: 800, ...bidBase } as never);

    // Lider 950'ye YÜKSELTEMEZ (eskiden rakip-1000 referansıyla geçiyordu).
    await expect(
      service.placeBid(seller.auth, l.id, { amount: 950, ...bidBase } as never),
    ).rejects.toThrow(/önceki teklifinizin/);
    // Düşürme serbest.
    const ok = await service.placeBid(seller.auth, l.id, {
      amount: 700,
      ...bidBase,
    } as never);
    expect(ok.status).toBe("SUBMITTED");
  });

  it("rakipsizken de yükseltme yok (ref=null boşluğu)", async () => {
    const { service, buyer, seller } = await pair();
    const l = await makeListing(prisma, {
      companyId: buyer.company.id,
      createdById: buyer.user.id,
      type: "ALIM",
      visibility: "CONNECTIONS",
      format: "ENGLISH_AUCTION",
      closesAt: future(1),
      priceDecrementType: "AMOUNT",
      priceDecrementValue: 50,
      priceDecrementBasis: "BEST_BID",
    });
    await service.placeBid(seller.auth, l.id, { amount: 500, ...bidBase } as never);
    await expect(
      service.placeBid(seller.auth, l.id, { amount: 600, ...bidBase } as never),
    ).rejects.toThrow(/önceki teklifinizin/);
  });
});

describe("Teklif durum kuralları (server-side)", () => {
  it("WITHDRAWN teklif yeniden verilemez; SUBMITTED RFQ revize edilemez", async () => {
    const { service, buyer, seller } = await pair();
    const l = await makeListing(prisma, {
      companyId: buyer.company.id,
      createdById: buyer.user.id,
      type: "ALIM",
      visibility: "CONNECTIONS",
      format: "RFQ",
      closesAt: future(1),
    });
    await service.placeBid(seller.auth, l.id, { amount: 100, ...bidBase } as never);
    // SUBMITTED RFQ → API'den de revize edilemez (eskiden upsert sessizce geçirirdi).
    await expect(
      service.placeBid(seller.auth, l.id, { amount: 90, ...bidBase } as never),
    ).rejects.toThrow(/düzenlenemez/);

    // Legacy WITHDRAWN kayıt (geri çekme özelliği kaldırıldı; doğrudan yazılır).
    await prisma.listingBid.updateMany({
      where: { listingId: l.id, bidderCompanyId: seller.company.id },
      data: { status: "WITHDRAWN" },
    });
    await expect(
      service.placeBid(seller.auth, l.id, { amount: 90, ...bidBase } as never),
    ).rejects.toThrow(/yeniden verilemez/);
  });

  it("geri çekilmiş (legacy WITHDRAWN) teklif kazandırılamaz", async () => {
    const { service, buyer, seller } = await pair();
    const l = await makeListing(prisma, {
      companyId: buyer.company.id,
      createdById: buyer.user.id,
      type: "ALIM",
      visibility: "CONNECTIONS",
      closesAt: future(1),
    });
    const bid = await makeBid(prisma, {
      listingId: l.id,
      bidderCompanyId: seller.company.id,
      createdById: seller.user.id,
      amount: 100,
    });
    // Geri çekilmiş teklife kazandırma reddedilir (onay penceresi güvencesi).
    await prisma.listingBid.update({
      where: { id: bid.id },
      data: { status: "WITHDRAWN" },
    });
    await expect(
      service.award(buyer.auth, l.id, bid.id),
    ).rejects.toThrow(/geçerli değil|Geçersiz teklif/);
  });
});

describe("create/update iş kuralı doğrulamaları", () => {
  const baseDto = (over: Record<string, unknown> = {}) => ({
    type: "ALIM",
    isInternational: false,
    visibility: "CONNECTIONS",
    title: "Test ihale",
    closesAt: future(2).toISOString(),
    format: "RFQ",
    ...over,
  });

  it("açık eksiltme doğrudan açılamaz; aktarmada azaltma zorunlu, PERCENT<100, çok-birim kur damgasıyla korunur", async () => {
    const { service, buyer } = await pair();
    // Doğrudan create yasak — İngiliz'e tek geçiş "Yeni Tur" aktarması.
    await expect(
      service.create(
        buyer.auth,
        baseDto({
          format: "ENGLISH_AUCTION",
          priceDecrementType: "AMOUNT",
          priceDecrementValue: 10,
        }) as never,
      ),
    ).rejects.toThrow(/doğrudan açılamaz/);

    // Eski create-doğrulamaları artık aktarma (createNextRound) yolunda işler.
    const l = await service.create(
      buyer.auth,
      baseDto({
        allowedCurrencies: ["TRY", "USD"],
        items: [{ name: "Kalem", quantity: 1, unit: "adet" }],
      }) as never,
    );
    const convert = (over: Record<string, unknown> = {}) =>
      service.createNextRound(buyer.auth as never, l.id, {
        type: "ENGLISH_AUCTION",
        carryBids: "NONE",
        closesAt: future(2).toISOString(),
        ...over,
      } as never);

    await expect(convert()).rejects.toThrow(/azaltma değeri zorunlu/);
    await expect(
      convert({ priceDecrementType: "PERCENT", priceDecrementValue: 100 }),
    ).rejects.toThrow(/100'den küçük/);

    // Geçerli aktarma: çok-birimli RFQ'nun izinli seti KORUNUR ve açılış
    // kur damgası basılır (6ff037b — eski "tek birime normalize" davranışı
    // bilinçli terk edildi; sözleşme auction-hardening.spec'te de sabit).
    await convert({
      priceDecrementType: "AMOUNT",
      priceDecrementValue: 10,
      priceDecrementBasis: "BEST_BID",
      bidVisibility: "BEST_PRICE",
    });
    const db = await prisma.listing.findUniqueOrThrow({ where: { id: l.id } });
    expect(db.format).toBe("ENGLISH_AUCTION");
    expect(db.allowedCurrencies).toEqual(["TRY", "USD"]);
    expect(db.auctionRateSnapshot).not.toBeNull();
  });

  it("PRIVATE ilan davetsiz yayınlanamaz (taslak serbest)", async () => {
    const { service, buyer } = await pair();
    await expect(
      service.create(buyer.auth, baseDto({ visibility: "PRIVATE" }) as never),
    ).rejects.toThrow(/en az bir davetli/);
    const draft = await service.create(
      buyer.auth,
      baseDto({ visibility: "PRIVATE", asDraft: true }) as never,
    );
    expect(draft.status).toBe("DRAFT");
  });

  it("geçersiz hedef ülke ve geçersiz kategori reddedilir", async () => {
    const { service, buyer } = await pair();
    await expect(
      service.create(
        buyer.auth,
        baseDto({ isInternational: true, targetCountries: ["XX"] }) as never,
      ),
    ).rejects.toThrow(/Geçersiz hedef ülke/);
    await expect(
      service.create(
        buyer.auth,
        baseDto({ categoryIds: ["99999999"] }) as never,
      ),
    ).rejects.toThrow(/Geçersiz kategori/);
  });

  it("izinli birimler ana birimi içermeli", async () => {
    const { service, buyer } = await pair();
    await expect(
      service.create(
        buyer.auth,
        baseDto({
          primaryCurrency: "TRY",
          allowedCurrencies: ["USD", "EUR"],
        }) as never,
      ),
    ).rejects.toThrow(/ana birimini içermeli/);
  });
});

describe("info-leak: erişim kontrolleri durum 400'lerinden önce", () => {
  it("davetsiz PRIVATE prober geçersiz para birimiyle 404 alır (400 değil)", async () => {
    const { service } = makeService();
    const buyer = await makeCompanyWithUser(prisma, { country: "TR" });
    const outsider = await makeCompanyWithUser(prisma, { country: "TR" });
    const l = await makeListing(prisma, {
      companyId: buyer.company.id,
      createdById: buyer.user.id,
      type: "ALIM",
      visibility: "PRIVATE",
      closesAt: future(1),
    });
    await expect(
      service.placeBid(outsider.auth, l.id, {
        amount: 100,
        currency: "JPY", // ilan izin vermiyor — ama önce 404 dönmeli
        ...bidBase,
      } as never),
    ).rejects.toThrow(/bulunamadı/);
  });
});

describe("davetli ülke-bypass + maskeli yanıt kırpma", () => {
  it("yurtiçi ilana davet edilen YABANCI firma detayı görebilir ve teklif verebilir", async () => {
    const { service } = makeService();
    const buyer = await makeCompanyWithUser(prisma, { country: "TR" });
    const foreign = await makeCompanyWithUser(prisma, { country: "DE" });
    const l = await makeListing(prisma, {
      companyId: buyer.company.id,
      createdById: buyer.user.id,
      type: "ALIM",
      visibility: "CONNECTIONS",
      closesAt: future(1),
    });
    await invite(prisma, l.id, foreign.company.id, buyer.user.id);

    const detail = (await service.getOne(foreign.auth, l.id)) as {
      invited: boolean;
      canBid: boolean;
    };
    expect(detail.invited).toBe(true);
    expect(detail.canBid).toBe(true);

    const bid = await service.placeBid(foreign.auth, l.id, {
      amount: 200,
      ...bidBase,
    } as never);
    expect(bid.status).toBe("SUBMITTED");
  });

  it("maskeli izleyici fiyat/eksiltme/adres verisi almaz ama kalem SAYISINI görür", async () => {
    const { service } = makeService();
    const buyer = await makeCompanyWithUser(prisma, { country: "TR" });
    const standard = await makeCompanyWithUser(prisma, {
      country: "TR",
      tier: "STANDARD",
    });
    const l = await makeListing(prisma, {
      companyId: buyer.company.id,
      createdById: buyer.user.id,
      type: "ALIM",
      visibility: "PUBLIC",
      format: "ENGLISH_AUCTION",
      closesAt: future(1),
      keywords: ["gizli-anahtar"],
      priceDecrementType: "AMOUNT",
      priceDecrementValue: 10,
    });
    await makeItem(prisma, l.id, { name: "Kalem 1" });

    const d = (await service.getOne(standard.auth, l.id)) as Record<
      string,
      unknown
    >;
    expect(d.masked).toBe(true);
    expect(d.english).toBeNull();
    expect(d.auctionView).toBeNull();
    expect(d.deliveryAddress).toBeNull();
    expect(d.keywords).toEqual([]);
    // Maskeli teaser: kalem adı/miktar/birim GÖRÜNÜR (ne alınıyor belli olsun)
    // ama fiyat/malzeme kodu/açıklama/sorular GİZLİ (rekabet-hassas veri sızmaz).
    const items = d.items as Array<Record<string, unknown>>;
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe("Kalem 1");
    expect(items[0].targetPrice).toBeNull();
    expect(items[0].materialCode).toBeNull();
    expect(items[0].description).toBeNull();
    expect(items[0].questions).toEqual([]);
    expect(d.itemCount).toBe(1); // sayı listeyle tutarlı görünür
  });
});

describe("tur taşıma round takibi", () => {
  it("AUTO taşınan teklif yeni turun round'una yazılır → sonraki NONE geçişi LOST'a çeker", async () => {
    const { service, buyer, seller } = await pair();
    const l = await makeListing(prisma, {
      companyId: buyer.company.id,
      createdById: buyer.user.id,
      type: "ALIM",
      visibility: "CONNECTIONS",
      status: "CLOSED",
      closesAt: new Date(),
    });
    const bid = await makeBid(prisma, {
      listingId: l.id,
      bidderCompanyId: seller.company.id,
      createdById: seller.user.id,
      amount: 100,
    });
    // Tur 1 → 2 (AUTO taşı).
    await service.createNextRound(buyer.auth, l.id, {
      type: "RFQ",
      closesAt: future(1).toISOString(),
      carryBids: "AUTO",
    } as never);
    const carried = await prisma.listingBid.findUniqueOrThrow({
      where: { id: bid.id },
    });
    expect(carried.round).toBe(2); // eskiden 1'de kalıyordu
    expect(carried.status).toBe("SUBMITTED");

    // Tur 2 → 3 (NONE): taşınan teklif artık LOST'a çekilir (eskiden canlı kalırdı).
    await prisma.listing.update({ where: { id: l.id }, data: { status: "CLOSED" } });
    await service.createNextRound(buyer.auth, l.id, {
      type: "RFQ",
      closesAt: future(1).toISOString(),
      carryBids: "NONE",
    } as never);
    const after = await prisma.listingBid.findUniqueOrThrow({
      where: { id: bid.id },
    });
    expect(after.status).toBe("LOST");
  });
});

describe("kalem-bazlı kazandırma — kısmi kazanım", () => {
  it("fiyatladığından azını kazanan AWARDED_PARTIAL olur", async () => {
    const { service, buyer, seller } = await pair();
    const rival = await makeCompanyWithUser(prisma, { country: "TR" });
    await connect(prisma, buyer.company.id, rival.company.id, buyer.user.id);
    const l = await makeListing(prisma, {
      companyId: buyer.company.id,
      createdById: buyer.user.id,
      type: "ALIM",
      visibility: "CONNECTIONS",
      status: "CLOSED",
    });
    const i1 = await makeItem(prisma, l.id, { name: "A" });
    const i2 = await makeItem(prisma, l.id, { name: "B", lineNo: 2 });
    const b1 = await makeBid(prisma, {
      listingId: l.id,
      bidderCompanyId: seller.company.id,
      createdById: seller.user.id,
      amount: 200,
      items: [
        { itemId: i1.id, unitPrice: 100 },
        { itemId: i2.id, unitPrice: 100 },
      ],
    });
    const b2 = await makeBid(prisma, {
      listingId: l.id,
      bidderCompanyId: rival.company.id,
      createdById: rival.user.id,
      amount: 90,
      items: [{ itemId: i2.id, unitPrice: 90 }],
    });

    // i1 → b1, i2 → b2: b1 iki kalem fiyatladı, 1 kazandı → KISMEN.
    await service.awardByItem(buyer.auth, l.id, [
      { itemId: i1.id, bidId: b1.id },
      { itemId: i2.id, bidId: b2.id },
    ]);
    const after1 = await prisma.listingBid.findUniqueOrThrow({
      where: { id: b1.id },
    });
    const after2 = await prisma.listingBid.findUniqueOrThrow({
      where: { id: b2.id },
    });
    expect(after1.status).toBe("AWARDED_PARTIAL");
    expect(after2.status).toBe("WON"); // tek kalem fiyatladı, onu kazandı
  });
});

describe("belge zorunluluğu (server-side)", () => {
  it("requireBidDocument: belgesiz GÖNDERİM reddedilir, taslak serbest", async () => {
    const { service, buyer, seller } = await pair();
    const l = await makeListing(prisma, {
      companyId: buyer.company.id,
      createdById: buyer.user.id,
      type: "ALIM",
      visibility: "CONNECTIONS",
      requireBidDocument: true,
      closesAt: future(1),
    });
    await expect(
      service.placeBid(seller.auth, l.id, { amount: 100, ...bidBase } as never),
    ).rejects.toThrow(/dosyası zorunlu/);
    const draft = await service.placeBid(seller.auth, l.id, {
      amount: 100,
      asDraft: true,
      ...bidBase,
    } as never);
    expect(draft.status).toBe("DRAFT");
  });
});
