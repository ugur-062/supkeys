/**
 * İngiliz Usulü sertleştirme — denetim bulgularının regresyon testleri:
 * tek para birimi normalizasyonu, SUBMITTED→DRAFT bypass reddi, buyNow tur
 * damgası, BEST_BID solo adım, auto-extend default'ları, taban=hemen-al reddi,
 * teslim şekli × kapsam doğrulaması.
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
  minPrice: 100,
  priceDecrementType: "AMOUNT",
  priceDecrementValue: 100,
  priceDecrementBasis: "BEST_BID",
  bidVisibility: "BEST_PRICE",
  items: [{ name: "Bakır hurda", quantity: 1, unit: "ton" }],
  ...over,
});

const rfqDto = (over: Record<string, unknown> = {}) =>
  auctionDto({
    format: "RFQ",
    priceDecrementType: undefined,
    priceDecrementValue: undefined,
    priceDecrementBasis: undefined,
    ...over,
  });

/** İngiliz usulüne tek meşru yol: RFQ aç → "Yeni Tur" ile aktar (doğrudan
 *  ENGLISH_AUCTION create artık reddedilir). Aktarım turu currentRound'u
 *  2'ye çeker. */
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
    priceDecrementType: "AMOUNT",
    priceDecrementValue: 100,
    priceDecrementBasis: "BEST_BID",
    bidVisibility: "BEST_PRICE",
    ...roundOver,
  } as never);
  return l;
}

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

describe("Auction — çoklu para birimi (kur damgalı)", () => {
  it("çok-birimli RFQ İngiliz'e aktarılınca izinli set KORUNUR ve açılış kur damgası basılır; yabancı birimle teklif kabul edilir", async () => {
    const { service, seller, b1 } = await sellerAndBuyers();
    // Çoklu birim artık auction'da da serbest — kıyaslar açılış günü kur
    // damgasıyla teklifçinin birimine çevrilir (auction-multicurrency.spec
    // adım/kıyas matematiğini ayrıntılı test eder).
    const l = await createAuction(service, seller.auth, {
      allowedCurrencies: ["TRY", "USD"],
    });
    const db = await prisma.listing.findUniqueOrThrow({ where: { id: l.id } });
    expect(db.allowedCurrencies).toEqual(["TRY", "USD"]);
    // Damga: mock TCMB kuru (30) izinli birimler için yazıldı.
    expect(db.auctionRateSnapshot).toMatchObject({ TRY: 1, USD: 30 });

    await expect(
      bid(service, b1.auth, l.id, 1000, { currency: "USD" }),
    ).resolves.toBeDefined();
    // İzinli SET dışı birim yine reddedilir.
    const b2bid = bid(service, b1.auth, l.id, 900, { currency: "EUR" });
    await expect(b2bid).rejects.toThrow(/geçersiz para birimi/);
  });

  it("İngiliz usulü doğrudan AÇILAMAZ; update arka kapısı da kapalı", async () => {
    const { service, seller } = await sellerAndBuyers();
    await expect(
      service.create(seller.auth, auctionDto() as never),
    ).rejects.toThrow(/doğrudan açılamaz/);

    // RFQ açıp düzenlemeyle İngiliz'e çevirme = doğrudan-açma yasağının
    // arka kapısı — o da reddedilir.
    const l = await service.create(seller.auth, rfqDto() as never);
    await expect(
      service.updateListing(seller.auth, l.id, auctionDto() as never),
    ).rejects.toThrow(/düzenlemeyle pazarlığa çevrilemez/);
  });
});

describe("Auction — SUBMITTED teklif taslağa çekilemez", () => {
  it("gönderilmiş auction teklifi asDraft:true ile DRAFT'a düşürülemez (yumuşak geri çekme yok)", async () => {
    const { service, seller, b1 } = await sellerAndBuyers();
    const l = await createAuction(service, seller.auth);
    await bid(service, b1.auth, l.id, 1000);

    await expect(
      bid(service, b1.auth, l.id, 500, { asDraft: true }),
    ).rejects.toThrow(/taslağa çekilemez/);

    // Teklif hâlâ SUBMITTED ve tutar değişmemiş.
    const dbBid = await prisma.listingBid.findFirstOrThrow({
      where: { listingId: l.id, bidderCompanyId: b1.company.id },
    });
    expect(dbBid.status).toBe("SUBMITTED");
    expect(Number(dbBid.amount)).toBe(1000);
  });
});

describe("Auction — buyNow tur damgası", () => {
  it("Hemen-Al teklifi ilanın GÜNCEL turuyla damgalanır (round=1 default'una düşmez)", async () => {
    const { service, seller, b1 } = await sellerAndBuyers();
    // Aktarım turu currentRound'u doğal olarak 2'ye çeker.
    const l = await createAuction(service, seller.auth, { buyNowPrice: 5000 });

    await service.buyNow(b1.auth, l.id, {
      deliveryDate: future(7).toISOString(),
      validityDays: 30,
    });
    const dbBid = await prisma.listingBid.findFirstOrThrow({
      where: { listingId: l.id, bidderCompanyId: b1.company.id },
    });
    expect(dbBid.round).toBe(2);
    // Para birimi de ilanın ana birimi olmalı (create yolunda TRY default'una
    // düşme regresyonu).
    expect(dbBid.currency).toBe("TRY");
    expect(dbBid.isBuyNow).toBe(true);
  });
});

describe("Auction — BEST_BID bazında solo adım", () => {
  it("rakip yokken kendi son teklifi referans olur — epsilon artış reddedilir", async () => {
    const { service, seller, b1 } = await sellerAndBuyers();
    const l = await createAuction(service, seller.auth);
    await bid(service, b1.auth, l.id, 1000);

    // Monotonluk 1000,01'e izin verirdi; adım (100) artık solo'da da zorlanır.
    await expect(bid(service, b1.auth, l.id, 1050)).rejects.toThrow(/en az/);
    const ok = await bid(service, b1.auth, l.id, 1100);
    expect(ok.status).toBe("SUBMITTED");
  });
});

describe("Auction — eleme sonrası yeniden teklif", () => {
  it("elenen (LOST) teklifçi auction'a yeniden katılabilir; adım kuralı en iyi rakibe göre işler", async () => {
    const { service, seller, b1, b2 } = await sellerAndBuyers();
    const l = await createAuction(service, seller.auth);
    await bid(service, b1.auth, l.id, 1000);
    await bid(service, b2.auth, l.id, 1100);

    const b1Bid = await prisma.listingBid.findFirstOrThrow({
      where: { listingId: l.id, bidderCompanyId: b1.company.id },
    });
    await service.eliminate(seller.auth, l.id, b1Bid.id, "fiyat yetersiz");

    // Yeniden teklif: en iyi (1100) + adım (100) tabanı geçerli.
    await expect(bid(service, b1.auth, l.id, 1150)).rejects.toThrow(/en az/);
    const back = await bid(service, b1.auth, l.id, 1200);
    expect(back.status).toBe("SUBMITTED");
  });
});

describe("Auction — auto-extend default'ları", () => {
  it("bayrak açık, eşik/dakika boş → 2dk/2dk default yazılır (sessiz devre dışı kalmaz)", async () => {
    const { service, seller } = await sellerAndBuyers();
    const l = await createAuction(
      service,
      seller.auth,
      {},
      { autoExtendOnLateBid: true },
    );
    const db = await prisma.listing.findUniqueOrThrow({ where: { id: l.id } });
    expect(db.autoExtendOnLateBid).toBe(true);
    expect(db.autoExtendThresholdMin).toBe(2);
    expect(db.autoExtendByMinutes).toBe(2);
  });
});

describe("SATIS fiyat doğrulaması — taban/hemen-al eşitliği", () => {
  it("hemen-al == taban reddedilir (normal teklif aralığı boş kalırdı)", async () => {
    const { service, seller } = await sellerAndBuyers();
    await expect(
      service.create(
        seller.auth,
        auctionDto({
          format: "RFQ",
          priceDecrementType: undefined,
          priceDecrementValue: undefined,
          priceDecrementBasis: undefined,
          minPrice: 1000,
          buyNowPrice: 1000,
        }) as never,
      ),
    ).rejects.toThrow(/büyük olmalı/);
  });
});

describe("Teslim şekli × kapsam doğrulaması", () => {
  it("yurtiçi ilanda Incoterm reddedilir; uluslararasıda DOMESTIC_* reddedilir", async () => {
    const { service, seller } = await sellerAndBuyers();
    const rfq = (over: Record<string, unknown>) =>
      auctionDto({
        format: "RFQ",
        priceDecrementType: undefined,
        priceDecrementValue: undefined,
        priceDecrementBasis: undefined,
        ...over,
      });

    await expect(
      service.create(
        seller.auth,
        rfq({ isInternational: false, deliveryTerm: "CIF" }) as never,
      ),
    ).rejects.toThrow(/Yurtiçi ilanda Incoterm seçilemez/);

    await expect(
      service.create(
        seller.auth,
        rfq({
          isInternational: true,
          targetCountries: ["DE"],
          deliveryTerm: "DOMESTIC_DELIVERED",
        }) as never,
      ),
    ).rejects.toThrow(/yurtiçi teslim şekli seçilemez/);

    // Uyumlu kombinasyonlar geçer.
    const domestic = await service.create(
      seller.auth,
      rfq({ deliveryTerm: "DOMESTIC_CARRIER_COLLECT" }) as never,
    );
    expect(domestic.status).toBe("OPEN");
  });
});
