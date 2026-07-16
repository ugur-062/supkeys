/**
 * Pazarlık — ÇOKLU PARA BİRİMİ. Minimum pay kaldırıldı (2026-07-13): fiyat
 * kuralı yalnız monotonluk ve birim kilidi sayesinde HEP teklifçinin kendi
 * biriminde işler (kur çevirisi gerektirmez). Kur damgası
 * (auctionRateSnapshot) gösterim/sıralama (TRY-normalize) için sürer; yeni
 * tur kuru olmayan birimle açılamaz.
 *
 * Test kurları: EUR=50 ₺, USD=40 ₺ (mock TCMB 30'dan ayrışsın diye damga
 * açıkça verilir).
 */
import { Prisma } from "@prisma/client";
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
  const { service, exchangeRates, approvals } = makeService();
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
  return { service, exchangeRates, approvals, owner, bidder, listing };
}

const submit = (amount: number, currency?: string) =>
  ({
    amount,
    currency,
    deliveryDate: FUTURE.toISOString(),
    validityDays: 30,
  }) as never;

describe("Çoklu birim — monotonluk kendi biriminde", () => {
  it("kendi öncekinden kesin düşük olmalı: eşit reddedilir, 1 sent düşük kabul", async () => {
    const { service, bidder, listing } = await auction();
    await makeBid(prisma, {
      listingId: listing.id,
      bidderCompanyId: bidder.company.id,
      createdById: bidder.user.id,
      amount: 100,
      currency: "EUR",
    });
    await expect(
      service.placeBid(bidder.auth, listing.id, submit(100, "EUR")),
    ).rejects.toThrow(/altında olmalı/);
    // Minimum pay yok — sembolik indirim bile geçerli, kur çevirisi gerekmez.
    await expect(
      service.placeBid(bidder.auth, listing.id, submit(99.99, "EUR")),
    ).resolves.toBeDefined();
  });

  it("hata mesajı teklifçinin biriminde konuşur (₺ değil)", async () => {
    const { service, bidder, listing } = await auction();
    await makeBid(prisma, {
      listingId: listing.id,
      bidderCompanyId: bidder.company.id,
      createdById: bidder.user.id,
      amount: 100,
      currency: "EUR",
    });
    const err = await service
      .placeBid(bidder.auth, listing.id, submit(150, "EUR"))
      .catch((e: Error) => e);
    expect(String((err as Error).message)).toMatch(/EUR/);
    expect(String((err as Error).message)).not.toMatch(/₺|500/);
  });
});

describe("Çoklu birim — birim kilidi ve kur bağımsızlığı", () => {
  it("gönderilmiş teklif varken para birimi değiştirilemez", async () => {
    const { service, bidder, listing } = await auction();
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

  it("damga YOK + güncel kur YOK → İLK teklif yine kabul (rakip kıyası kalktı, kural kur istemez)", async () => {
    const { service, exchangeRates, bidder, listing } = await auction({
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
    // Eskiden rakip referans çevrilemeyince reddediliyordu; minimum pay ve
    // rakip kıyası kalktığından fiyat kuralı kur gerektirmez. TRY karşılığı
    // (exchangeRateSnapshot) boş kalır — gösterimde "—".
    await expect(
      service.placeBid(bidder.auth, listing.id, submit(10, "EUR")),
    ).resolves.toBeDefined();
    const db = await prisma.listingBid.findUniqueOrThrow({
      where: {
        listingId_bidderCompanyId: {
          listingId: listing.id,
          bidderCompanyId: bidder.company.id,
        },
      },
      select: { exchangeRateSnapshot: true },
    });
    expect(db.exchangeRateSnapshot).toBeNull();
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

  it("INV-FX-1: Decimal-STRING damga da TRY-normalize sıralar (yeni storage)", async () => {
    // Yeni yazımlar kuru string saklar; auctionTryValue reader hem string
    // (yeni) hem number (legacy — yukarıdaki testler) kabul etmeli.
    const { service, owner, listing } = await auction({
      priceDecrementBasis: "BEST_BID",
      auctionRateSnapshot: { TRY: "1", EUR: "50", USD: "40" },
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
      amount: 19, // = 950 ₺ (string kur 50 ile) → 999 ₺'yi geçer
      currency: "EUR",
    });
    const detail = (await service.getOne(owner.auth, listing.id)) as {
      english: {
        currentBest: string;
        currentBestCurrency: string;
        rateSnapshot: Record<string, number>;
      };
    };
    expect(Number(detail.english.currentBest)).toBe(19);
    expect(detail.english.currentBestCurrency).toBe("EUR");
    // EKRAN sınırı: rateSnapshot API sözleşmesi number kalır (string değil).
    expect(detail.english.rateSnapshot.EUR).toBe(50);
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
    // INV-FX-1: snapshot kurları artık Decimal-STRING saklanır (eski: JSON float).
    expect(after.auctionRateSnapshot).toMatchObject({ TRY: "1", EUR: "48" });
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
        bidVisibility: "OWN_RANK",
      } as never),
    ).rejects.toThrow(/EUR için TCMB kuru bulunamadı/);
  });
});

describe("Onay eşiği — TEK BAZ + X3 fail-closed (INV-FX-1)", () => {
  it("eşik TRY karşılığı AÇILIŞ damgasından hesaplanır (kazandırma-günü canlı kur DEĞİL)", async () => {
    const { service, exchangeRates, approvals, owner, bidder, listing } =
      await auction(); // damga { EUR: 50 }
    // Canlı kur damgadan tamamen farklı — kullanılmadığını ispatlar (eski
    // toTryAmount getCurrentRate'ti; 19×1=19 eşiği yanlış atlatırdı).
    exchangeRates.getCurrentRate.mockResolvedValue(1);
    approvals.requestApproval.mockResolvedValue({
      approved: false,
      requestId: "r1",
    });
    const bid = await makeBid(prisma, {
      listingId: listing.id,
      bidderCompanyId: bidder.company.id,
      createdById: bidder.user.id,
      amount: 19,
      currency: "EUR", // per-bid damga YOK (makeBid set etmez) → yalnız açılış damgası
    });

    await service.award(owner.auth, listing.id, bid.id);

    expect(approvals.requestApproval).toHaveBeenCalledTimes(1);
    const arg = approvals.requestApproval.mock.calls[0][1];
    // 19 × 50 (açılış damgası) = 950 ₺ — canlı kur (1) ile 19 olurdu.
    expect(new Prisma.Decimal(arg.amount).toNumber()).toBe(950);
    expect(arg.currency).toBe("TRY");
    expect(arg.forceRequireApproval).toBeFalsy();
  });

  it("X3: baz bilinmiyorsa (açılış damgası + teklif damgası YOK) onay ZORUNLU (ham fallback yok)", async () => {
    const { service, exchangeRates, approvals, owner, bidder, listing } =
      await auction({ auctionRateSnapshot: undefined });
    // Eski davranış: getCurrentRate fallback (30) → 100×30=3000 eşiğe göre
    // sessizce değerlendirilir/atlanırdı. Artık: baz yok → onay zorunlu.
    exchangeRates.getCurrentRate.mockResolvedValue(30);
    approvals.requestApproval.mockResolvedValue({
      approved: false,
      requestId: "r1",
    });
    const bid = await makeBid(prisma, {
      listingId: listing.id,
      bidderCompanyId: bidder.company.id,
      createdById: bidder.user.id,
      amount: 100,
      currency: "EUR", // exchangeRateSnapshot null
    });

    await service.award(owner.auth, listing.id, bid.id);

    const arg = approvals.requestApproval.mock.calls[0][1];
    expect(arg.forceRequireApproval).toBe(true);
    // Ham yabancı tutar + KENDİ birimiyle saklanır (0/TRY yanıltmaz).
    expect(arg.currency).toBe("EUR");
    expect(new Prisma.Decimal(arg.amount).toNumber()).toBe(100);
  });
});

describe("Taban kontrolü — TEK BAZ (INV-FX-1 Faz 3)", () => {
  it("SATIS auction: taban kıyası AÇILIŞ damgasından yapılır (getFreshRate DEĞİL)", async () => {
    const { service, exchangeRates, bidder, listing } = await auction({
      type: "SATIS",
      minPrice: "1000", // ₺ taban
    }); // damga { TRY:1, EUR:50, USD:40 }
    // getFreshRate damgadan çok farklı — kullanılmadığını ispatlar: 1 olsaydı
    // 25 € × 1 = 25 ₺ < 1000 taban → red olurdu. Damga (50) ile 1250 ₺ → kabul.
    exchangeRates.getFreshRate.mockResolvedValue(1);
    await expect(
      service.placeBid(bidder.auth, listing.id, submit(25, "EUR")),
    ).resolves.toBeDefined();
    expect(exchangeRates.getFreshRate).not.toHaveBeenCalled(); // damga vardı → taze kur sorulmadı
  });

  it("SATIS auction: damga bazlı taban ALTINDA teklif reddedilir", async () => {
    const { service, exchangeRates, bidder, listing } = await auction({
      type: "SATIS",
      minPrice: "1000",
    });
    // getFreshRate kullanılsaydı 15 × 999 = 14985 ≥ 1000 kabul edilirdi; damga
    // (50) ile 15 € = 750 ₺ < 1000 → RED. Damganın enforce edildiğini ispatlar.
    exchangeRates.getFreshRate.mockResolvedValue(999);
    await expect(
      service.placeBid(bidder.auth, listing.id, submit(15, "EUR")),
    ).rejects.toThrow(/taban fiyat/);
  });

  it("RFQ (damga yok) SATIS: taban kıyası getFreshRate strict — kur yoksa RED", async () => {
    // RFQ'da açılış damgası üretilmez → tek-baz per-bid/taze kur. Taban money
    // gate'i getFreshRate strict kalır: kur null → fail-closed (yanlış kıyas yok).
    const { service, exchangeRates, owner, bidder } = await auction();
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "SATIS",
      status: "OPEN",
      visibility: "PUBLIC",
      format: "RFQ",
      closesAt: FUTURE,
      primaryCurrency: "TRY",
      allowedCurrencies: ["TRY", "EUR"] as never,
      minPrice: "1000",
      // auctionRateSnapshot YOK (RFQ)
    });
    exchangeRates.getFreshRate.mockResolvedValue(null); // TCMB taze kur yok
    await expect(
      service.placeBid(bidder.auth, listing.id, submit(50, "EUR")),
    ).rejects.toThrow(/kur bilgisi yok|karşılaştırılamıyor/i);
  });
});
