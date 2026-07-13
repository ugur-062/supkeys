/**
 * Pazarlık (İngiliz usulü) — yeni kural seti (2026-07-13): minimum azaltma
 * payı YOK; tek fiyat kuralı "kendi öncekinden kesin iyi" + TURDA TEK AKTİF
 * GÖNDERİM (taşınan teklif hak yakmaz, eleme hakkı sıfırlar). Otomatik
 * uzatma korunur. Kalemsiz ilan → placeBid dto.amount kullanır.
 */
import { prisma, truncateAll } from "./test-db";
import { makeBid, makeCompanyWithUser, makeListing } from "./factories";
import { makeService } from "./make-service";

const FUTURE = new Date(Date.now() + 7 * 24 * 3600 * 1000);

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

async function auction(over: Record<string, unknown> = {}) {
  const { service } = makeService();
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
    ...over,
  });
  return { service, owner, bidder, listing };
}

const submit = (amount: number) =>
  ({
    amount,
    deliveryDate: FUTURE.toISOString(),
    validityDays: 30,
  }) as never;

describe("Pazarlık — fiyat ve tur hakkı kuralları", () => {
  it("rakip referansı YOK: ilk teklif en iyinin üzerinde bile kabul", async () => {
    const { service, bidder, listing } = await auction();
    const rival = await makeCompanyWithUser(prisma, { country: "TR" });
    await makeBid(prisma, {
      listingId: listing.id,
      bidderCompanyId: rival.company.id,
      createdById: rival.user.id,
      amount: 1000,
    });
    // Minimum pay / en-iyiyi-geçme şartı kaldırıldı — kazandırma manuel,
    // sıralama görünürlükle yönetilir. 2000 kabul edilir.
    await expect(
      service.placeBid(bidder.auth, listing.id, submit(2000)),
    ).resolves.toBeDefined();
  });

  it("kendi öncekinden KESİN iyi olmalı: eşit reddedilir, 1 kuruş düşük kabul", async () => {
    const { service, bidder, listing } = await auction();
    // Taşınan (aktif olmayan) teklif: activeBidRound yok → hak duruyor.
    await makeBid(prisma, {
      listingId: listing.id,
      bidderCompanyId: bidder.company.id,
      createdById: bidder.user.id,
      amount: 1000,
    });
    await expect(
      service.placeBid(bidder.auth, listing.id, submit(1000)),
    ).rejects.toThrow(/altında olmalı/);
    await expect(
      service.placeBid(bidder.auth, listing.id, submit(1000.5)),
    ).rejects.toThrow(/altında olmalı/);
    // Sembolik indirim bile GEÇERLİ (pay şartı yok) — caydırıcılık tur
    // hakkından gelir.
    await expect(
      service.placeBid(bidder.auth, listing.id, submit(999.99)),
    ).resolves.toBeDefined();
  });

  it("TURDA TEK AKTİF GÖNDERİM: ikinci gönderim reddedilir", async () => {
    const { service, bidder, listing } = await auction();
    await expect(
      service.placeBid(bidder.auth, listing.id, submit(1000)),
    ).resolves.toBeDefined();
    await expect(
      service.placeBid(bidder.auth, listing.id, submit(900)),
    ).rejects.toThrow(/bu turdaki teklifinizi verdiniz/i);
  });

  it("taşınan (carry-over) teklif hak YAKMAZ: yeni turda bir kez iyileştirilebilir", async () => {
    const { service, bidder, listing } = await auction({ currentRound: 2 });
    // Önceki turun aktif teklifi 2. tura taşınmış: round=2 ama
    // activeBidRound=1 (taşıma activeBidRound'a dokunmaz).
    await makeBid(prisma, {
      listingId: listing.id,
      bidderCompanyId: bidder.company.id,
      createdById: bidder.user.id,
      amount: 1000,
      round: 2,
      activeBidRound: 1,
    });
    await expect(
      service.placeBid(bidder.auth, listing.id, submit(950)),
    ).resolves.toBeDefined();
    // Hak kullanıldı — aynı turda ikinci gönderim yok.
    await expect(
      service.placeBid(bidder.auth, listing.id, submit(900)),
    ).rejects.toThrow(/bu turdaki teklifinizi verdiniz/i);
  });

  it("elenen (LOST) tedarikçi aynı turda yeniden teklif verebilir (hak sıfırlanır)", async () => {
    const { service, bidder, listing } = await auction();
    await makeBid(prisma, {
      listingId: listing.id,
      bidderCompanyId: bidder.company.id,
      createdById: bidder.user.id,
      amount: 1000,
      status: "LOST",
      round: 1,
      activeBidRound: 1,
    });
    // Alıcının elemesi bilinçli sıfırlama — düzeltme yolu açık. Monotonluk
    // da LOST teklife bakmaz (yeniden giriş serbest fiyatla).
    await expect(
      service.placeBid(bidder.auth, listing.id, submit(1200)),
    ).resolves.toBeDefined();
  });
});

describe("İngiliz Usulü — otomatik uzatma", () => {
  it("kapanışa yakın gelen teklif kapanışı ileri atar", async () => {
    const soon = new Date(Date.now() + 2 * 60 * 1000); // 2 dk sonra
    const { service, bidder, listing } = await auction({
      closesAt: soon,
      autoExtendOnLateBid: true,
      autoExtendThresholdMin: 10,
      autoExtendByMinutes: 30,
    });
    await service.placeBid(bidder.auth, listing.id, submit(500));
    const after = await prisma.listing.findUniqueOrThrow({
      where: { id: listing.id },
    });
    expect(after.closesAt!.getTime()).toBeGreaterThan(soon.getTime());
  });
});
