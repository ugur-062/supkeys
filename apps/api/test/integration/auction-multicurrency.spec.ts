/**
 * İngiliz Usulü — ÇOKLU PARA BİRİMİ. Azaltma payı ilanın ana biriminde
 * tanımlanır; açılış günü kur damgası (auctionRateSnapshot) ile teklifçinin
 * birimine çevrilir. Tüm kıyaslar (rakip referans, adım, monotonluk)
 * teklifçinin biriminde işler; birim ilk gönderilmiş teklifle kilitlenir.
 *
 * Test kurları: EUR=50 ₺, USD=40 ₺ (mock TCMB 30'dan ayrışsın diye damga
 * açıkça verilir — damga ≠ güncel kur olduğunda damganın kazandığı görülür).
 */
import { prisma, truncateAll } from "./test-db";
import { makeBid, makeCompanyWithUser, makeListing } from "./factories";
import { makeService } from "./make-service";

const FUTURE = new Date(Date.now() + 7 * 24 * 3600 * 1000);
const SNAP = { TRY: 1, EUR: 50, USD: 40 };

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

async function auction(over: Record<string, unknown> = {}) {
  const { service, exchangeRates } = makeService();
  const owner = await makeCompanyWithUser(prisma, { country: "TR" });
  const bidder = await makeCompanyWithUser(prisma, { country: "TR" });
  const listing = await makeListing(prisma, {
    companyId: owner.company.id,
    createdById: owner.user.id,
    type: "ALIM",
    status: "OPEN",
    visibility: "PUBLIC",
    format: "ENGLISH_AUCTION",
    closesAt: FUTURE,
    primaryCurrency: "TRY",
    allowedCurrencies: ["TRY", "EUR", "USD"] as never,
    auctionRateSnapshot: SNAP,
    priceDecrementType: "AMOUNT",
    priceDecrementValue: "500",
    ...over,
  });
  return { service, exchangeRates, owner, bidder, listing };
}

const submit = (amount: number, currency?: string) =>
  ({
    amount,
    currency,
    deliveryDate: FUTURE.toISOString(),
    validityDays: 30,
  }) as never;

describe("Çoklu birim — adım çevrimi (açılış günü damgası)", () => {
  it("OWN_LAST_BID: 500 ₺ pay EUR teklifçisine 10 € olarak işler", async () => {
    const { service, bidder, listing } = await auction({
      priceDecrementBasis: "OWN_LAST_BID",
    });
    await makeBid(prisma, {
      listingId: listing.id,
      bidderCompanyId: bidder.company.id,
      createdById: bidder.user.id,
      amount: 100,
      currency: "EUR",
    });
    // adım = 500 / 50 = 10 € → maxAllowed = 100 − 10 = 90 €.
    await expect(
      service.placeBid(bidder.auth, listing.id, submit(90.01, "EUR")),
    ).rejects.toThrow(/90/);
    await expect(
      service.placeBid(bidder.auth, listing.id, submit(90, "EUR")),
    ).resolves.toBeDefined();
  });

  it("adım çevriminde damga kazanır (güncel mock 30 değil, damga 50)", async () => {
    const { service, bidder, listing } = await auction({
      priceDecrementBasis: "OWN_LAST_BID",
    });
    await makeBid(prisma, {
      listingId: listing.id,
      bidderCompanyId: bidder.company.id,
      createdById: bidder.user.id,
      amount: 100,
      currency: "EUR",
    });
    // Damga yerine güncel kur (30) kullanılsaydı adım 16,67 € olurdu ve
    // 90 € reddedilirdi (100−16,67=83,33) — damga (10 €) ile kabul edilir.
    await expect(
      service.placeBid(bidder.auth, listing.id, submit(90, "EUR")),
    ).resolves.toBeDefined();
  });

  it("BEST_BID: TRY'lik rakip referansı teklifçinin birimine çevrilir", async () => {
    const { service, bidder, listing } = await auction({
      priceDecrementBasis: "BEST_BID",
    });
    const rival = await makeCompanyWithUser(prisma, { country: "TR" });
    await makeBid(prisma, {
      listingId: listing.id,
      bidderCompanyId: rival.company.id,
      createdById: rival.user.id,
      amount: 1000,
      currency: "TRY",
    });
    // best = 1000 ₺ = 20 € → maxAllowed = 20 − 10 = 10 €.
    await expect(
      service.placeBid(bidder.auth, listing.id, submit(10.01, "EUR")),
    ).rejects.toThrow(/usul/i);
    await expect(
      service.placeBid(bidder.auth, listing.id, submit(10, "EUR")),
    ).resolves.toBeDefined();
  });

  it("PERCENT adım birimden bağımsız (kendi biriminde yüzde)", async () => {
    const { service, bidder, listing } = await auction({
      priceDecrementBasis: "OWN_LAST_BID",
      priceDecrementType: "PERCENT",
      priceDecrementValue: "10",
    });
    await makeBid(prisma, {
      listingId: listing.id,
      bidderCompanyId: bidder.company.id,
      createdById: bidder.user.id,
      amount: 100,
      currency: "USD",
    });
    // %10 → maxAllowed = 90 $.
    await expect(
      service.placeBid(bidder.auth, listing.id, submit(90.5, "USD")),
    ).rejects.toThrow(/usul/i);
    await expect(
      service.placeBid(bidder.auth, listing.id, submit(90, "USD")),
    ).resolves.toBeDefined();
  });

  it("hata mesajı teklifçinin biriminde konuşur (₺ değil)", async () => {
    const { service, bidder, listing } = await auction({
      priceDecrementBasis: "OWN_LAST_BID",
    });
    await makeBid(prisma, {
      listingId: listing.id,
      bidderCompanyId: bidder.company.id,
      createdById: bidder.user.id,
      amount: 100,
      currency: "EUR",
    });
    const err = await service
      .placeBid(bidder.auth, listing.id, submit(95, "EUR"))
      .catch((e: Error) => e);
    expect(String((err as Error).message)).toMatch(/EUR/);
    expect(String((err as Error).message)).not.toMatch(/₺|500/);
  });
});

describe("Çoklu birim — birim kilidi ve kur eksikliği", () => {
  it("gönderilmiş teklif varken para birimi değiştirilemez", async () => {
    const { service, bidder, listing } = await auction({
      priceDecrementBasis: "OWN_LAST_BID",
    });
    await makeBid(prisma, {
      listingId: listing.id,
      bidderCompanyId: bidder.company.id,
      createdById: bidder.user.id,
      amount: 100,
      currency: "EUR",
    });
    await expect(
      service.placeBid(bidder.auth, listing.id, submit(4000, "TRY")),
    ).rejects.toThrow(/para birimi değiştirilemez/);
  });

  it("damga YOK + güncel kur YOK → çapraz-birim teklif reddedilir (yanlış kıyas yapılmaz)", async () => {
    const { service, exchangeRates, bidder, listing } = await auction({
      priceDecrementBasis: "BEST_BID",
      auctionRateSnapshot: undefined,
    });
    exchangeRates.getCurrentRate.mockRejectedValue(new Error("TCMB yok"));
    const rival = await makeCompanyWithUser(prisma, { country: "TR" });
    await makeBid(prisma, {
      listingId: listing.id,
      bidderCompanyId: rival.company.id,
      createdById: rival.user.id,
      amount: 1000,
      currency: "TRY",
    });
    await expect(
      service.placeBid(bidder.auth, listing.id, submit(10, "EUR")),
    ).rejects.toThrow(/[Kk]ur bilgisi eksik/);
  });

  it("legacy tek-birim tur (damga yok) aynen çalışır — kur hiç gerekmez", async () => {
    const { service, exchangeRates, bidder, listing } = await auction({
      priceDecrementBasis: "BEST_BID",
      auctionRateSnapshot: undefined,
      allowedCurrencies: ["TRY"] as never,
    });
    exchangeRates.getCurrentRate.mockRejectedValue(new Error("TCMB yok"));
    const rival = await makeCompanyWithUser(prisma, { country: "TR" });
    await makeBid(prisma, {
      listingId: listing.id,
      bidderCompanyId: rival.company.id,
      createdById: rival.user.id,
      amount: 1000,
      currency: "TRY",
    });
    // adım 500 ₺, primary=TRY → çevrim yok; maxAllowed 500 ₺.
    await expect(
      service.placeBid(bidder.auth, listing.id, submit(501, "TRY")),
    ).rejects.toThrow(/usul/i);
    await expect(
      service.placeBid(bidder.auth, listing.id, submit(500, "TRY")),
    ).resolves.toBeDefined();
  });
});

describe("Çoklu birim — en iyi teklif TRY-normalize sıralanır", () => {
  it("getOne: 19 € (=950 ₺) teklifi 999 ₺'yi geçer; kendi birimiyle döner", async () => {
    const { service, owner, listing } = await auction({
      priceDecrementBasis: "BEST_BID",
    });
    const r1 = await makeCompanyWithUser(prisma, { country: "TR" });
    const r2 = await makeCompanyWithUser(prisma, { country: "TR" });
    await makeBid(prisma, {
      listingId: listing.id,
      bidderCompanyId: r1.company.id,
      createdById: r1.user.id,
      amount: 999,
      currency: "TRY",
    });
    await makeBid(prisma, {
      listingId: listing.id,
      bidderCompanyId: r2.company.id,
      createdById: r2.user.id,
      amount: 19,
      currency: "EUR",
    });
    const detail = (await service.getOne(owner.auth, listing.id)) as {
      english: { currentBest: string; currentBestCurrency: string };
    };
    expect(Number(detail.english.currentBest)).toBe(19);
    expect(detail.english.currentBestCurrency).toBe("EUR");
  });

  it("auctionView (ALL): sıralama normalize, satırlar kendi birimiyle", async () => {
    const { service, bidder, listing } = await auction({
      priceDecrementBasis: "BEST_BID",
      bidVisibility: "ALL",
    });
    const rival = await makeCompanyWithUser(prisma, { country: "TR" });
    await makeBid(prisma, {
      listingId: listing.id,
      bidderCompanyId: rival.company.id,
      createdById: rival.user.id,
      amount: 999,
      currency: "TRY",
    });
    await makeBid(prisma, {
      listingId: listing.id,
      bidderCompanyId: bidder.company.id,
      createdById: bidder.user.id,
      amount: 19, // = 950 ₺ → 1. sıra
      currency: "EUR",
    });
    const detail = (await service.getOne(bidder.auth, listing.id)) as {
      auctionView: {
        myRank: number;
        allBids: { rank: number; total: string; currency: string }[];
      };
    };
    expect(detail.auctionView.myRank).toBe(1);
    expect(detail.auctionView.allBids[0]).toMatchObject({
      rank: 1,
      currency: "EUR",
    });
    expect(detail.auctionView.allBids[1]).toMatchObject({
      rank: 2,
      currency: "TRY",
    });
  });
});

describe("Yeni tur — kur damgası ve çoklu-birim taşıma", () => {
  it("createNextRound: damga basılır, izinli set korunur, EUR teklif CANLI taşınır", async () => {
    const { service, exchangeRates } = makeService();
    exchangeRates.getCurrentRate.mockImplementation(
      async (cur: string) => (cur === "EUR" ? 48 : cur === "USD" ? 38 : 1),
    );
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const bidder = await makeCompanyWithUser(prisma, { country: "TR" });
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      status: "CLOSED",
      visibility: "PUBLIC",
      format: "RFQ",
      closesAt: new Date(Date.now() - 3600_000),
      primaryCurrency: "TRY",
      allowedCurrencies: ["TRY", "EUR"] as never,
    });
    await makeBid(prisma, {
      listingId: listing.id,
      bidderCompanyId: bidder.company.id,
      createdById: bidder.user.id,
      amount: 20,
      currency: "EUR",
    });

    await service.createNextRound(owner.auth, listing.id, {
      type: "ENGLISH_AUCTION",
      carryBids: "AUTO",
      eliminateNonBidders: false,
      closesAt: FUTURE.toISOString(),
      priceDecrementType: "AMOUNT",
      priceDecrementValue: 500,
      priceDecrementBasis: "OWN_LAST_BID",
      bidVisibility: "OWN_RANK",
    } as never);

    const after = await prisma.listing.findUniqueOrThrow({
      where: { id: listing.id },
      select: {
        allowedCurrencies: true,
        auctionRateSnapshot: true,
        currentRound: true,
      },
    });
    expect(after.allowedCurrencies).toEqual(["TRY", "EUR"]);
    expect(after.auctionRateSnapshot).toMatchObject({ TRY: 1, EUR: 48 });
    const carried = await prisma.listingBid.findUniqueOrThrow({
      where: {
        listingId_bidderCompanyId: {
          listingId: listing.id,
          bidderCompanyId: bidder.company.id,
        },
      },
      select: { status: true, round: true, currency: true },
    });
    // Eski davranış EUR teklifi taslağa çekiyordu — artık canlı taşınır.
    expect(carried).toMatchObject({
      status: "SUBMITTED",
      round: after.currentRound,
      currency: "EUR",
    });
  });

  it("kuru olmayan birimle yeni tur açılamaz (açık hata)", async () => {
    const { service, exchangeRates } = makeService();
    exchangeRates.getCurrentRate.mockRejectedValue(new Error("TCMB yok"));
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      status: "CLOSED",
      visibility: "PUBLIC",
      format: "RFQ",
      closesAt: new Date(Date.now() - 3600_000),
      primaryCurrency: "TRY",
      allowedCurrencies: ["TRY", "EUR"] as never,
    });
    await expect(
      service.createNextRound(owner.auth, listing.id, {
        type: "ENGLISH_AUCTION",
        carryBids: "AUTO",
        eliminateNonBidders: false,
        closesAt: FUTURE.toISOString(),
        priceDecrementType: "AMOUNT",
        priceDecrementValue: 500,
        priceDecrementBasis: "OWN_LAST_BID",
        bidVisibility: "OWN_RANK",
      } as never),
    ).rejects.toThrow(/EUR için TCMB kuru bulunamadı/);
  });
});
