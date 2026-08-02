/**
 * company-listings (ihaleler) — integration testleri (gerçek Postgres, izole
 * rothern_test şeması). Denetimde bulunan kritik güvenlik/doğruluk noktalarını
 * kapsar: kapalı zarf, ülke görünürlüğü, IDOR/owner-scope, teklif kapıları
 * (F2/F3/F6), kazandırma→sipariş doğruluğu, çift-kazandırma (F1), kalem-bazlı
 * (F8), state-machine.
 */
import { CompanyRole, type ListingStatus, type ListingType } from "@rothern/db";
import type { AuthenticatedCompanyUser } from "../../src/modules/company-auth/strategies/company-jwt.strategy";
import { prisma, truncateAll } from "./test-db";
import {
  connect,
  invite,
  makeBid,
  makeCompanyWithUser,
  makeItem,
  makeListing,
  makeUser,
} from "./factories";
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

// Bir ALIM ilanı + sahip + (varsayılan) bağlı/aynı-ülke teklif veren kur.
async function setupAlim(
  listingOver: Parameters<typeof makeListing>[1] extends infer _ ? any : never = {},
) {
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
    ...listingOver,
  });
  const item = await makeItem(prisma, listing.id);
  return { service, mocks, owner, bidder, listing, item };
}

describe("getOne — kapalı zarf (closed envelope)", () => {
  it("sahip TÜM teklifleri (isim+tutar) görür", async () => {
    const { service, owner, bidder, listing, item } = await setupAlim();
    await makeBid(prisma, {
      listingId: listing.id,
      bidderCompanyId: bidder.company.id,
      createdById: bidder.user.id,
      amount: 1000,
      items: [{ itemId: item.id, unitPrice: 1000 }],
    });
    const res = await service.getOne(owner.auth, listing.id);
    expect(res.isOwner).toBe(true);
    expect(Array.isArray((res as { bids?: unknown[] }).bids)).toBe(true);
    expect((res as { bids: unknown[] }).bids).toHaveLength(1);
  });

  it("A2: sahip-detay teklifleri KUR-NORMALİZE sıralar (karışık kurda doğru firma üstte)", async () => {
    const { service } = makeService();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const bTry = await makeCompanyWithUser(prisma, { country: "TR" });
    const bUsd = await makeCompanyWithUser(prisma, { country: "TR" });
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      status: "OPEN",
      visibility: "PUBLIC",
      closesAt: FUTURE,
    });
    const item = await makeItem(prisma, listing.id);
    // TRY teklif 3000.
    await makeBid(prisma, {
      listingId: listing.id,
      bidderCompanyId: bTry.company.id,
      createdById: bTry.user.id,
      amount: 3000,
      currency: "TRY",
      items: [{ itemId: item.id, unitPrice: 3000 }],
    });
    // USD teklif 200 → kur 30 ile 6000 TRY normalize.
    const usdBid = await makeBid(prisma, {
      listingId: listing.id,
      bidderCompanyId: bUsd.company.id,
      createdById: bUsd.user.id,
      amount: 200,
      currency: "USD",
      items: [{ itemId: item.id, unitPrice: 200 }],
    });
    await prisma.listingBid.update({
      where: { id: usdBid.id },
      data: { exchangeRateSnapshot: 30 },
    });

    const res = (await service.getOne(owner.auth, listing.id)) as {
      bids: { amount: string; currency: string; bidderCompanyId: string }[];
    };
    // ALIM = düşük iyi. TRY-normalize: TRY 3000 < USD 6000 → TRY teklifi ÜSTTE.
    expect(res.bids[0]!.currency).toBe("TRY");
    expect(res.bids[0]!.bidderCompanyId).toBe(bTry.company.id);
    expect(res.bids[1]!.currency).toBe("USD");
    // BUG KANITI: eski ham `Number(a.amount)-Number(b.amount)` sıralaması TERS
    // verirdi — ilk sıradaki ham tutar (3000) ikincidekinden (200) BÜYÜK; ham
    // float USD'yi (200) öne alır, sahip yanlış firmaya kazandırırdı.
    expect(Number(res.bids[0]!.amount)).toBeGreaterThan(
      Number(res.bids[1]!.amount),
    );
  });

  it("teklif veren RAKİP tekliflerini GÖREMEZ (bids alanı yok)", async () => {
    const { service, bidder, listing, item } = await setupAlim();
    const rival = await makeCompanyWithUser(prisma, { country: "TR" });
    await makeBid(prisma, {
      listingId: listing.id,
      bidderCompanyId: rival.company.id,
      createdById: rival.user.id,
      amount: 900,
      items: [{ itemId: item.id, unitPrice: 900 }],
    });
    const res = await service.getOne(bidder.auth, listing.id);
    expect(res.isOwner).toBe(false);
    expect("bids" in res).toBe(false);
    expect("invitations" in res).toBe(false);
  });

  it("İngiliz Usulü OWN_ONLY: rakip kimliği/tutarı sızmaz", async () => {
    const { service, owner, bidder } = await setupAlim();
    const auction = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      status: "OPEN",
      visibility: "PUBLIC",
      format: "ENGLISH_AUCTION",
      bidVisibility: "OWN_ONLY",
      closesAt: FUTURE,
    });
    const rival = await makeCompanyWithUser(prisma, { country: "TR" });
    await makeBid(prisma, {
      listingId: auction.id,
      bidderCompanyId: rival.company.id,
      createdById: rival.user.id,
      amount: 500,
    });
    const res = await service.getOne(bidder.auth, auction.id);
    expect("bids" in res).toBe(false);
    expect((res as { auctionView: unknown }).auctionView).toBeNull();
  });
});

describe("getOne — ülke görünürlüğü", () => {
  it("yurtiçi ilan: farklı ülke firması göremez (404)", async () => {
    const { service, listing } = await setupAlim(); // owner TR
    const foreign = await makeCompanyWithUser(prisma, { country: "DE" });
    await expect(service.getOne(foreign.auth, listing.id)).rejects.toThrow();
  });

  it("uluslararası ilan: sahibin ülkesindeki firma göremez (404)", async () => {
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const { service } = makeService();
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      status: "OPEN",
      visibility: "PUBLIC",
      isInternational: true,
      targetCountries: [],
      closesAt: FUTURE,
    });
    const sameCountry = await makeCompanyWithUser(prisma, { country: "TR" });
    await expect(
      service.getOne(sameCountry.auth, listing.id),
    ).rejects.toThrow();
  });

  it("uluslararası + hedef ülke listesi: yalnız hedef ülke görür", async () => {
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const { service } = makeService();
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      status: "OPEN",
      visibility: "PUBLIC",
      isInternational: true,
      targetCountries: ["DE"],
      closesAt: FUTURE,
    });
    const de = await makeCompanyWithUser(prisma, { country: "DE" });
    const fr = await makeCompanyWithUser(prisma, { country: "FR" });
    await expect(service.getOne(de.auth, listing.id)).resolves.toBeDefined();
    await expect(service.getOne(fr.auth, listing.id)).rejects.toThrow();
  });

  it("engellenen firma ilanı göremez (404)", async () => {
    const { service, mocks, bidder, listing } = await setupAlim();
    mocks.blocks.blockedCompanyIds.mockResolvedValue([bidder.company.id]);
    await expect(service.getOne(bidder.auth, listing.id)).rejects.toThrow();
  });
});

describe("açılış embargosu — gelecek tarihli bidsOpenAt", () => {
  const OPEN_LATER = new Date(Date.now() + 3600 * 1000);

  it("açılışı gelmemiş ilanı sahibi görür; davetli dahil kimse göremez (404) ve listede çıkmaz", async () => {
    const { service, owner, bidder, listing } = await setupAlim({
      bidsOpenAt: OPEN_LATER,
    });
    await connect(prisma, owner.company.id, bidder.company.id, owner.user.id);
    await invite(prisma, listing.id, bidder.company.id, owner.user.id);

    const own = (await service.getOne(owner.auth, listing.id)) as {
      isOwner: boolean;
    };
    expect(own.isOwner).toBe(true);

    await expect(service.getOne(bidder.auth, listing.id)).rejects.toThrow(
      /bulunamadı/,
    );
    const rows = await service.sellerTenders(bidder.auth);
    expect(rows.find((r) => r.id === listing.id)).toBeUndefined();
  });

  it("açılış geçmişse ilan görünür; duyuru damgası atomik + idempotent", async () => {
    const { service, bidder, listing } = await setupAlim({
      bidsOpenAt: PAST,
    });
    const d = (await service.getOne(bidder.auth, listing.id)) as {
      isOwner: boolean;
    };
    expect(d.isOwner).toBe(false);

    await service.announceListingOpen(listing.id, "invitation");
    const first = await prisma.listing.findUniqueOrThrow({
      where: { id: listing.id },
      select: { openNotifiedAt: true },
    });
    expect(first.openNotifiedAt).not.toBeNull();

    // İkinci çağrı damgayı DEĞİŞTİRMEZ (çift bildirim koruması).
    await service.announceListingOpen(listing.id, "invitation");
    const second = await prisma.listing.findUniqueOrThrow({
      where: { id: listing.id },
      select: { openNotifiedAt: true },
    });
    expect(second.openNotifiedAt!.getTime()).toBe(
      first.openNotifiedAt!.getTime(),
    );
  });

  it("embargolu ilanda duyuru ERTELENİR — damga basılmaz (cron açılışta gönderir)", async () => {
    const { service, listing } = await setupAlim({ bidsOpenAt: OPEN_LATER });
    await service.announceListingOpen(listing.id, "invitation");
    const db = await prisma.listing.findUniqueOrThrow({
      where: { id: listing.id },
      select: { openNotifiedAt: true },
    });
    expect(db.openNotifiedAt).toBeNull();
  });
});

describe("IDOR / owner-scope — sahip olmayan mutasyon yapamaz", () => {
  it("award başka firma tarafından çağrılamaz", async () => {
    const { service, bidder, listing, item } = await setupAlim();
    const bid = await makeBid(prisma, {
      listingId: listing.id,
      bidderCompanyId: bidder.company.id,
      createdById: bidder.user.id,
      amount: 1000,
      items: [{ itemId: item.id, unitPrice: 1000 }],
    });
    await expect(
      service.award(bidder.auth, listing.id, bid.id),
    ).rejects.toThrow();
  });

  it("eliminate / cancel / closeNoAward başka firma tarafından çağrılamaz", async () => {
    const { service, bidder, listing, item } = await setupAlim();
    const bid = await makeBid(prisma, {
      listingId: listing.id,
      bidderCompanyId: bidder.company.id,
      createdById: bidder.user.id,
      amount: 1000,
      items: [{ itemId: item.id, unitPrice: 1000 }],
    });
    await expect(
      service.eliminate(bidder.auth, listing.id, bid.id),
    ).rejects.toThrow();
    await expect(service.cancel(bidder.auth, listing.id)).rejects.toThrow();
    await expect(
      service.closeNoAward(bidder.auth, listing.id),
    ).rejects.toThrow();
  });
});

describe("placeBid — kapılar", () => {
  it("kendi ilanına teklif veremez", async () => {
    const { service, owner, listing, item } = await setupAlim();
    await expect(
      service.placeBid(owner.auth, listing.id, {
        items: [{ itemId: item.id, unitPrice: 100 }],
        deliveryDate: FUTURE.toISOString(),
        validityDays: 30,
      } as never),
    ).rejects.toThrow();
  });

  it("kapanış geçmişse teklif alınmaz (F3)", async () => {
    const { service, bidder, listing, item } = await setupAlim({
      closesAt: PAST,
    });
    await expect(
      service.placeBid(bidder.auth, listing.id, {
        items: [{ itemId: item.id, unitPrice: 100 }],
        deliveryDate: FUTURE.toISOString(),
        validityDays: 30,
      } as never),
    ).rejects.toThrow(/süre|kapal/i);
  });

  it("açılış saatinden önce teklif alınmaz", async () => {
    const { service, bidder, listing, item } = await setupAlim({
      bidsOpenAt: FUTURE,
    });
    await expect(
      service.placeBid(bidder.auth, listing.id, {
        items: [{ itemId: item.id, unitPrice: 100 }],
        deliveryDate: FUTURE.toISOString(),
        validityDays: 30,
      } as never),
    ).rejects.toThrow();
  });

  it("yanlış ülkeden teklif veremez (F2)", async () => {
    const { service, listing, item } = await setupAlim(); // owner TR, yurtiçi
    const foreign = await makeCompanyWithUser(prisma, { country: "DE" });
    await expect(
      service.placeBid(foreign.auth, listing.id, {
        items: [{ itemId: item.id, unitPrice: 100 }],
        deliveryDate: FUTURE.toISOString(),
        validityDays: 30,
      } as never),
    ).rejects.toThrow();
  });

  it("aynı kalem iki kez girilirse reddedilir (F6)", async () => {
    const { service, bidder, listing, item } = await setupAlim();
    await expect(
      service.placeBid(bidder.auth, listing.id, {
        items: [
          { itemId: item.id, unitPrice: 100 },
          { itemId: item.id, unitPrice: 200 },
        ],
        deliveryDate: FUTURE.toISOString(),
        validityDays: 30,
      } as never),
    ).rejects.toThrow(/birden fazla/i);
  });

  it("gönderilen teklif sıfır toplam olamaz (F6)", async () => {
    const { service, bidder, listing, item } = await setupAlim();
    await expect(
      service.placeBid(bidder.auth, listing.id, {
        items: [{ itemId: item.id, unitPrice: 0 }],
        deliveryDate: FUTURE.toISOString(),
        validityDays: 30,
      } as never),
    ).rejects.toThrow(/sıfır/i);
  });

  it("geçerli teklif kabul edilir ve tutar = Σ(birim×miktar)", async () => {
    const { service, bidder, listing } = await setupAlim();
    // miktar 3 olan kalem → 0.1 × 3 = 0.3 (Decimal; float 0.30000…04 değil)
    const item = await makeItem(prisma, listing.id, {
      lineNo: 2,
      quantity: "3",
    });
    const res = await service.placeBid(bidder.auth, listing.id, {
      items: [{ itemId: item.id, unitPrice: 0.1 }],
      deliveryDate: FUTURE.toISOString(),
      validityDays: 30,
    } as never);
    expect((res as { status: string }).status).toBe("SUBMITTED");
    const stored = await prisma.listingBid.findFirstOrThrow({
      where: { listingId: listing.id, bidderCompanyId: bidder.company.id },
    });
    expect(stored.amount.toString()).toBe("0.3");
  });
});

describe("award — kazandırma & sipariş doğruluğu", () => {
  it("ALIM: kazanan WON, diğerleri LOST, ilan AWARDED, sipariş satıcı=teklifçi", async () => {
    const { service, owner, bidder, listing, item } = await setupAlim();
    const loser = await makeCompanyWithUser(prisma, { country: "TR" });
    const winBid = await makeBid(prisma, {
      listingId: listing.id,
      bidderCompanyId: bidder.company.id,
      createdById: bidder.user.id,
      amount: 1000,
      items: [{ itemId: item.id, unitPrice: 1000 }],
    });
    await makeBid(prisma, {
      listingId: listing.id,
      bidderCompanyId: loser.company.id,
      createdById: loser.user.id,
      amount: 1200,
      items: [{ itemId: item.id, unitPrice: 1200 }],
    });

    const res = await service.award(owner.auth, listing.id, winBid.id);
    expect((res as { number?: string }).number).toMatch(/^ROT-ORD-/);

    const l = await prisma.listing.findUniqueOrThrow({
      where: { id: listing.id },
    });
    expect(l.status).toBe("AWARDED");
    const won = await prisma.listingBid.findUniqueOrThrow({
      where: { id: winBid.id },
    });
    expect(won.status).toBe("WON");
    const losers = await prisma.listingBid.findMany({
      where: { listingId: listing.id, status: "LOST" },
    });
    expect(losers).toHaveLength(1);

    const orders = await prisma.companyOrder.findMany({
      where: { listingId: listing.id },
    });
    expect(orders).toHaveLength(1);
    expect(orders[0].sellerCompanyId).toBe(bidder.company.id); // ALIM → teklifçi satar
    expect(orders[0].buyerCompanyId).toBe(owner.company.id);
    expect(orders[0].amount.toString()).toBe("1000");
  });

  it("ilan paymentTiming + teminat şartı siparişe kopyalanır (varsayılana düşmez)", async () => {
    const { service, owner, bidder, listing, item } = await setupAlim({
      paymentTiming: "BEFORE_DELIVERY",
    });
    // Factory geçirmezse doğrudan set et (test kesinliği). Teminat şartı da
    // ilan sahibinin seçimi — award'da siparişe snapshot'lanmalı.
    await prisma.listing.update({
      where: { id: listing.id },
      data: {
        paymentTiming: "BEFORE_DELIVERY",
        requireGuaranteeLetter: true,
        // Faz 2 ödeme planı — award'da siparişe snapshot'lanmalı (S2).
        paymentCategory: "ADVANCE",
        advancePercent: 50,
        paymentDays: 30,
        paymentNote: "kalan mal kabulünde",
        deliveryTerm: "DOMESTIC_DELIVERED",
      },
    });
    const winBid = await makeBid(prisma, {
      listingId: listing.id,
      bidderCompanyId: bidder.company.id,
      createdById: bidder.user.id,
      amount: 1000,
      items: [{ itemId: item.id, unitPrice: 1000 }],
    });
    await service.award(owner.auth, listing.id, winBid.id);
    const order = await prisma.companyOrder.findFirstOrThrow({
      where: { listingId: listing.id },
    });
    expect(order.paymentTiming).toBe("BEFORE_DELIVERY");
    expect(order.requireGuaranteeLetter).toBe(true);
    // Ödeme planı + teslim şekli snapshot'ı (Faz 2, S2).
    expect(order.paymentCategory).toBe("ADVANCE");
    expect(order.advancePercent).toBe(50);
    expect(order.paymentDays).toBe(30);
    expect(order.paymentNote).toBe("kalan mal kabulünde");
    expect(order.deliveryTerm).toBe("DOMESTIC_DELIVERED");
  });

  it("ödeme planı: zamanlama plandan türetilir, kategori-dışı alanlar normalize (Faz 2)", async () => {
    const owner = await makeCompanyWithUser(prisma, {});
    const { service } = makeService();
    const dto = (over: Record<string, unknown>) => ({
      type: "ALIM",
      format: "RFQ",
      isInternational: false,
      visibility: "CONNECTIONS",
      title: "Ödeme planı türetme",
      closesAt: new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString(),
      primaryCurrency: "TRY",
      allowedCurrencies: ["TRY"],
      items: [{ name: "Kalem", quantity: 1, unit: "adet" }],
      ...over,
    });

    // Peşin %50 (yurtiçi) → BEFORE_DELIVERY; teminat şartı korunur.
    const adv = await service.create(
      owner.auth,
      dto({
        paymentCategory: "ADVANCE",
        advancePercent: 50,
        paymentDays: 30,
        requireGuaranteeLetter: true,
      }) as never,
    );
    const a = await prisma.listing.findUniqueOrThrow({ where: { id: adv.id } });
    expect(a.paymentTiming).toBe("BEFORE_DELIVERY");
    expect(a.advancePercent).toBe(50);
    expect(a.paymentDays).toBe(30);
    expect(a.requireGuaranteeLetter).toBe(true);

    // Kısmi peşin ULUSLARARASI ilanda reddedilir.
    await expect(
      service.create(
        owner.auth,
        dto({
          isInternational: true,
          targetCountries: ["DE"],
          paymentCategory: "ADVANCE",
          advancePercent: 40,
        }) as never,
      ),
    ).rejects.toThrow(/yurtiçi/);

    // Dış-ticaret kategorileri (LC/vesaik/mal mukabili) YURTİÇİ ilanda
    // reddedilir (2026-08-02 kuralı) — teslim-şekli kapısıyla simetrik.
    for (const cat of [
      "LETTER_OF_CREDIT",
      "CASH_AGAINST_DOCS",
      "MAL_MUKABILI",
    ]) {
      await expect(
        service.create(
          owner.auth,
          dto({ paymentCategory: cat, lcType: "SIGHT" }) as never,
        ),
      ).rejects.toThrow(/uluslararası/);
    }

    // Simetrik (madde 20): açık hesap/çek/senet ULUSLARARASI ilanda reddedilir.
    for (const cat of ["OPEN_ACCOUNT", "CHEQUE", "SENET"]) {
      await expect(
        service.create(
          owner.auth,
          dto({
            isInternational: true,
            targetCountries: ["DE"],
            paymentCategory: cat,
            paymentDays: 30,
          }) as never,
        ),
      ).rejects.toThrow(/yurtiçi ilanlarda seçilebilir/);
    }

    // LC-Usance (uluslararası) → BEFORE_DELIVERY; teminat bayrağı LC'de
    // false'a normalize.
    const lc = await service.create(
      owner.auth,
      dto({
        isInternational: true,
        targetCountries: ["DE"],
        paymentCategory: "LETTER_OF_CREDIT",
        lcType: "USANCE",
        paymentDays: 90,
        lcConfirmed: true,
        requireGuaranteeLetter: true,
        // Kategori-dışı bayat alan — sessizce sıfırlanmalı.
        advancePercent: 70,
      }) as never,
    );
    const l = await prisma.listing.findUniqueOrThrow({ where: { id: lc.id } });
    expect(l.paymentTiming).toBe("BEFORE_DELIVERY");
    expect(l.lcType).toBe("USANCE");
    expect(l.lcConfirmed).toBe(true);
    expect(l.advancePercent).toBeNull();
    expect(l.requireGuaranteeLetter).toBe(false);

    // Varsayılan (kategori gönderilmedi) → Açık Hesap, AFTER_DELIVERY.
    const def = await service.create(owner.auth, dto({}) as never);
    const d = await prisma.listing.findUniqueOrThrow({ where: { id: def.id } });
    expect(d.paymentCategory).toBe("OPEN_ACCOUNT");
    expect(d.paymentTiming).toBe("AFTER_DELIVERY");

    // Vadeli gün olmadan reddedilir; Özel not olmadan reddedilir.
    await expect(
      service.create(owner.auth, dto({ paymentCategory: "DEFERRED" }) as never),
    ).rejects.toThrow(/gün/);
    await expect(
      service.create(owner.auth, dto({ paymentCategory: "CUSTOM" }) as never),
    ).rejects.toThrow(/not/);

    // SENET: vade günü zorunlu; verilince AFTER_DELIVERY.
    await expect(
      service.create(owner.auth, dto({ paymentCategory: "SENET" }) as never),
    ).rejects.toThrow(/gün/);
    const senet = await service.create(
      owner.auth,
      dto({ paymentCategory: "SENET", paymentDays: 45 }) as never,
    );
    const sn = await prisma.listing.findUniqueOrThrow({
      where: { id: senet.id },
    });
    expect(sn.paymentCategory).toBe("SENET");
    expect(sn.paymentDays).toBe(45);
    expect(sn.paymentTiming).toBe("AFTER_DELIVERY");

    // VESAİK MUKABİLİ (uluslararası): ek zorunlu alan yok; belge karşılığı
    // → BEFORE_DELIVERY.
    const cad = await service.create(
      owner.auth,
      dto({
        isInternational: true,
        targetCountries: ["DE"],
        paymentCategory: "CASH_AGAINST_DOCS",
      }) as never,
    );
    const cd = await prisma.listing.findUniqueOrThrow({ where: { id: cad.id } });
    expect(cd.paymentCategory).toBe("CASH_AGAINST_DOCS");
    expect(cd.paymentTiming).toBe("BEFORE_DELIVERY");
  });

  it("requireBidDocument: belgesiz kazanan reddedilir", async () => {
    const { service, owner, bidder, listing, item } = await setupAlim({
      requireBidDocument: true,
    });
    const bid = await makeBid(prisma, {
      listingId: listing.id,
      bidderCompanyId: bidder.company.id,
      createdById: bidder.user.id,
      amount: 1000,
      items: [{ itemId: item.id, unitPrice: 1000 }],
    });
    await expect(
      service.award(owner.auth, listing.id, bid.id),
    ).rejects.toThrow(/belge/i);
  });

  it("kazandırılmış ilan tekrar kazandırılamaz (F1 — çift sipariş yok)", async () => {
    const { service, owner, bidder, listing, item } = await setupAlim();
    const bid = await makeBid(prisma, {
      listingId: listing.id,
      bidderCompanyId: bidder.company.id,
      createdById: bidder.user.id,
      amount: 1000,
      items: [{ itemId: item.id, unitPrice: 1000 }],
    });
    await service.award(owner.auth, listing.id, bid.id);
    await expect(
      service.award(owner.auth, listing.id, bid.id),
    ).rejects.toThrow();
    const orders = await prisma.companyOrder.findMany({
      where: { listingId: listing.id },
    });
    expect(orders).toHaveLength(1);
  });

  it("eşzamanlı iki award → tek sipariş (F1 atomik guard)", async () => {
    const { service, owner, bidder, listing, item } = await setupAlim();
    const bid = await makeBid(prisma, {
      listingId: listing.id,
      bidderCompanyId: bidder.company.id,
      createdById: bidder.user.id,
      amount: 1000,
      items: [{ itemId: item.id, unitPrice: 1000 }],
    });
    const results = await Promise.allSettled([
      service.award(owner.auth, listing.id, bid.id),
      service.award(owner.auth, listing.id, bid.id),
    ]);
    const ok = results.filter((r) => r.status === "fulfilled").length;
    expect(ok).toBeGreaterThanOrEqual(1);
    const orders = await prisma.companyOrder.findMany({
      where: { listingId: listing.id },
    });
    expect(orders).toHaveLength(1);
  });
});

describe("awardByItem — kalem bazlı", () => {
  it("aynı kalem birden çok kazanana verilemez (F8)", async () => {
    const { service, owner, bidder, listing, item } = await setupAlim();
    const b2 = await makeCompanyWithUser(prisma, { country: "TR" });
    const bid1 = await makeBid(prisma, {
      listingId: listing.id,
      bidderCompanyId: bidder.company.id,
      createdById: bidder.user.id,
      amount: 100,
      items: [{ itemId: item.id, unitPrice: 100 }],
    });
    const bid2 = await makeBid(prisma, {
      listingId: listing.id,
      bidderCompanyId: b2.company.id,
      createdById: b2.user.id,
      amount: 120,
      items: [{ itemId: item.id, unitPrice: 120 }],
    });
    await expect(
      service.awardByItem(owner.auth, listing.id, [
        { itemId: item.id, bidId: bid1.id },
        { itemId: item.id, bidId: bid2.id },
      ]),
    ).rejects.toThrow();
  });

  it("kalem bazlı kazandırma satıcı başına sipariş oluşturur", async () => {
    const { service, owner, bidder, listing, item } = await setupAlim();
    const item2 = await makeItem(prisma, listing.id, { lineNo: 2 });
    const seller2 = await makeCompanyWithUser(prisma, { country: "TR" });
    const bidA = await makeBid(prisma, {
      listingId: listing.id,
      bidderCompanyId: bidder.company.id,
      createdById: bidder.user.id,
      amount: 100,
      items: [{ itemId: item.id, unitPrice: 100 }],
    });
    const bidB = await makeBid(prisma, {
      listingId: listing.id,
      bidderCompanyId: seller2.company.id,
      createdById: seller2.user.id,
      amount: 200,
      items: [{ itemId: item2.id, unitPrice: 200 }],
    });
    const res = await service.awardByItem(owner.auth, listing.id, [
      { itemId: item.id, bidId: bidA.id },
      { itemId: item2.id, bidId: bidB.id },
    ]);
    expect((res as { count?: number }).count).toBe(2);
    const orders = await prisma.companyOrder.findMany({
      where: { listingId: listing.id },
    });
    expect(orders).toHaveLength(2);
  });

  it("X5: 0-fiyatlı kalem satırı olan tam-kazanan WON damgalanır (Kısmi DEĞİL)", async () => {
    const { service, owner, bidder, listing, item } = await setupAlim();
    const item2 = await makeItem(prisma, listing.id, { lineNo: 2 });
    const bid = await makeBid(prisma, {
      listingId: listing.id,
      bidderCompanyId: bidder.company.id,
      createdById: bidder.user.id,
      amount: 100,
      items: [{ itemId: item.id, unitPrice: 100 }],
    });
    // 0-fiyatlı satır enjekte et — normal submit reddeder (:3015), latent
    // ıraksamayı doğrudan kur: "fiyatlı sayısı" iki farklı hesaplanırsa bug tetiklenir.
    await prisma.listingBidItem.create({
      data: { bidId: bid.id, itemId: item2.id, unitPrice: 0 },
    });
    // Bidder yalnız fiyatladığı kalemi (item) kazanır → TAM kazanan olmalı.
    await service.awardByItem(owner.auth, listing.id, [
      { itemId: item.id, bidId: bid.id },
    ]);
    const after = await prisma.listingBid.findUniqueOrThrow({
      where: { id: bid.id },
    });
    // Fix: unitPrice>0 sayımı → priced=1, won=1 → WON. Eskiden _count._all=2 →
    // 1<2 → AWARDED_PARTIAL (yanlış).
    expect(after.status).toBe("WON");
  });

  it("requireBidDocument: kazananlardan birinin belgesi yoksa reddedilir (groupBy guard)", async () => {
    const { service, owner, bidder, listing, item } = await setupAlim({
      requireBidDocument: true,
    });
    const item2 = await makeItem(prisma, listing.id, { lineNo: 2 });
    const seller2 = await makeCompanyWithUser(prisma, { country: "TR" });
    const bidA = await makeBid(prisma, {
      listingId: listing.id,
      bidderCompanyId: bidder.company.id,
      createdById: bidder.user.id,
      amount: 100,
      items: [{ itemId: item.id, unitPrice: 100 }],
    });
    const bidB = await makeBid(prisma, {
      listingId: listing.id,
      bidderCompanyId: seller2.company.id,
      createdById: seller2.user.id,
      amount: 200,
      items: [{ itemId: item2.id, unitPrice: 200 }],
    });
    // Yalnız bidA'ya belge → bidB belgesiz → reddedilmeli.
    await prisma.listingBidDocument.create({
      data: {
        bidId: bidA.id,
        key: `listing-bids/${bidA.id}/x.pdf`,
        fileName: "x.pdf",
        mimeType: "application/pdf",
        uploadedByCompanyId: bidder.company.id,
      },
    });
    await expect(
      service.awardByItem(owner.auth, listing.id, [
        { itemId: item.id, bidId: bidA.id },
        { itemId: item2.id, bidId: bidB.id },
      ]),
    ).rejects.toThrow(/belge/i);

    // İkisine de belge → geçer.
    await prisma.listingBidDocument.create({
      data: {
        bidId: bidB.id,
        key: `listing-bids/${bidB.id}/y.pdf`,
        fileName: "y.pdf",
        mimeType: "application/pdf",
        uploadedByCompanyId: seller2.company.id,
      },
    });
    const res = await service.awardByItem(owner.auth, listing.id, [
      { itemId: item.id, bidId: bidA.id },
      { itemId: item2.id, bidId: bidB.id },
    ]);
    expect((res as { count?: number }).count).toBe(2);
  });

  it("SATIS kalem-bazlı: her kazanan firmanın teslim adresi doğru snapshot'lanır (batch)", async () => {
    const { service } = makeService();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const buyer1 = await makeCompanyWithUser(prisma, { country: "TR" });
    const buyer2 = await makeCompanyWithUser(prisma, { country: "TR" });
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "SATIS",
      status: "OPEN",
      visibility: "PUBLIC",
      closesAt: FUTURE,
    });
    const i1 = await makeItem(prisma, listing.id, { lineNo: 1 });
    const i2 = await makeItem(prisma, listing.id, { lineNo: 2 });
    const addr1 = await prisma.companyAddress.create({
      data: {
        companyId: buyer1.company.id,
        type: "TESLIMAT",
        title: "Depo 1",
        contactName: "Ali",
        country: "TR",
        city: "İstanbul",
        addressLine: "Adres 1",
      },
    });
    const addr2 = await prisma.companyAddress.create({
      data: {
        companyId: buyer2.company.id,
        type: "TESLIMAT",
        title: "Depo 2",
        contactName: "Veli",
        country: "TR",
        city: "Ankara",
        addressLine: "Adres 2",
      },
    });
    const bid1 = await makeBid(prisma, {
      listingId: listing.id,
      bidderCompanyId: buyer1.company.id,
      createdById: buyer1.user.id,
      amount: 100,
      items: [{ itemId: i1.id, unitPrice: 100 }],
    });
    const bid2 = await makeBid(prisma, {
      listingId: listing.id,
      bidderCompanyId: buyer2.company.id,
      createdById: buyer2.user.id,
      amount: 200,
      items: [{ itemId: i2.id, unitPrice: 200 }],
    });
    await prisma.listingBid.update({
      where: { id: bid1.id },
      data: { deliveryAddressId: addr1.id },
    });
    await prisma.listingBid.update({
      where: { id: bid2.id },
      data: { deliveryAddressId: addr2.id },
    });

    await service.awardByItem(owner.auth, listing.id, [
      { itemId: i1.id, bidId: bid1.id },
      { itemId: i2.id, bidId: bid2.id },
    ]);

    // Her firmanın siparişi kendi teslim adresi snapshot'ını taşır.
    const o1 = await prisma.companyOrder.findFirstOrThrow({
      where: { listingId: listing.id, buyerCompanyId: buyer1.company.id },
    });
    const o2 = await prisma.companyOrder.findFirstOrThrow({
      where: { listingId: listing.id, buyerCompanyId: buyer2.company.id },
    });
    expect((o1.deliveryAddress as { city: string }).city).toBe("İstanbul");
    expect((o2.deliveryAddress as { city: string }).city).toBe("Ankara");
  });
});

describe("eliminate — state machine", () => {
  it("sahip SUBMITTED teklifi eler (LOST)", async () => {
    const { service, owner, bidder, listing, item } = await setupAlim();
    const bid = await makeBid(prisma, {
      listingId: listing.id,
      bidderCompanyId: bidder.company.id,
      createdById: bidder.user.id,
      amount: 1000,
      items: [{ itemId: item.id, unitPrice: 1000 }],
    });
    await service.eliminate(owner.auth, listing.id, bid.id, "uygun değil");
    const after = await prisma.listingBid.findUniqueOrThrow({
      where: { id: bid.id },
    });
    expect(after.status).toBe("LOST");
  });
});

describe("Faz 5 — kalem teslim tarihi award'da siparişe kopyalanır", () => {
  it("bid item deliveryDate + note sipariş kalemine snapshot'lanır", async () => {
    const { service, owner, bidder, listing, item } = await setupAlim();
    const dd = new Date("2026-09-15T00:00:00.000Z");
    const winBid = await makeBid(prisma, {
      listingId: listing.id,
      bidderCompanyId: bidder.company.id,
      createdById: bidder.user.id,
      amount: 1000,
      items: [
        { itemId: item.id, unitPrice: 1000, deliveryDate: dd, note: "hızlı teslim" },
      ],
    });
    await service.award(owner.auth, listing.id, winBid.id);
    const order = await prisma.companyOrder.findFirstOrThrow({
      where: { listingId: listing.id },
      include: { items: true },
    });
    expect(order.items).toHaveLength(1);
    expect(order.items[0]!.deliveryDate?.toISOString()).toBe(dd.toISOString());
    expect(order.items[0]!.note).toBe("hızlı teslim");
  });
});

// ---------------------------------------------------------------------------
// İlan YÖNETİM aksiyonlarında firma-içi rol/oluşturan kapısı
// (assertListingManageRole). Firma-sahipliği (companyId) kapısı KORUNUR; üstüne:
//   (a) tarafa göre buy:/sell:listing:manage izni VAR, VE
//   (b) ilanı bu kişi açmış (createdById) VEYA firma sahibi (isOwner).
// Görüntüleme değişmez — bu yalnız mutasyon aksiyonlarını kapsar.
// ---------------------------------------------------------------------------
describe("ilan yönetim authz — assertListingManageRole", () => {
  const DENY = /yönetme yetkiniz yok/;

  function authFor(
    company: { id: string; country: string; tier: "STANDART" | "GOLD"; ownerUserId: string | null },
    user: { id: string; email: string; roles: CompanyRole[] },
    over: Partial<AuthenticatedCompanyUser> = {},
  ): AuthenticatedCompanyUser {
    return {
      userId: user.id,
      companyId: company.id,
      email: user.email,
      roles: user.roles,
      country: company.country,
      tier: company.tier,
      companyVerificationStatus: company.companyVerificationStatus,
      isOwner: company.ownerUserId === user.id,
      permissionsOverride: null,
      ...over,
    } as AuthenticatedCompanyUser;
  }

  // Owner firma (SAHİP) + ilanı açan doğru-taraf operatör + o operatörün açtığı ilan.
  async function setup(type: ListingType = "ALIM", status: ListingStatus = "OPEN") {
    const { service } = makeService();
    const oc = await makeCompanyWithUser(prisma, { country: "TR", tier: "GOLD" });
    const opRole =
      type === "ALIM" ? CompanyRole.SATIN_ALMACI : CompanyRole.SATISCI;
    const creator = await makeUser(prisma, oc.company.id, [opRole]);
    const listing = await makeListing(prisma, {
      companyId: oc.company.id,
      createdById: creator.id,
      type,
      status,
      visibility: "PUBLIC",
      closesAt: FUTURE,
    });
    return { service, company: oc.company, ownerAuth: oc.auth, creator, listing, opRole };
  }

  // Aksiyonu minimal argümanla tetikle — authz kapısı iş-mantığından ÖNCE
  // çalıştığı için geçersiz argüman authz sonucunu etkilemez.
  type Invoke = (
    service: Awaited<ReturnType<typeof setup>>["service"],
    auth: AuthenticatedCompanyUser,
    id: string,
  ) => Promise<unknown>;
  const METHODS: { name: string; run: Invoke }[] = [
    { name: "updateListing", run: (s, a, id) => s.updateListing(a, id, {} as never) },
    { name: "deleteListing", run: (s, a, id) => s.deleteListing(a, id) },
    { name: "publishListing", run: (s, a, id) => s.publishListing(a, id) },
    { name: "createNextRound", run: (s, a, id) => s.createNextRound(a, id, {} as never) },
    { name: "addInvitations", run: (s, a, id) => s.addInvitations(a, id, []) },
    { name: "eliminate", run: (s, a, id) => s.eliminate(a, id, "no-such-bid") },
    { name: "cancel", run: (s, a, id) => s.cancel(a, id) },
    { name: "startEvaluation", run: (s, a, id) => s.startEvaluation(a, id) },
    { name: "closeNoAward", run: (s, a, id) => s.closeNoAward(a, id) },
    {
      name: "changeClosingTime",
      run: (s, a, id) => s.changeClosingTime(a, id, FUTURE.toISOString()),
    },
    { name: "updateInternalNotes", run: (s, a, id) => s.updateInternalNotes(a, id, "not") },
  ];

  const errOf = (p: Promise<unknown>): Promise<string> =>
    p.then(() => "").catch((e: unknown) => (e as Error)?.message ?? String(e));

  for (const m of METHODS) {
    it(`${m.name}: ilanı açan doğru-taraf operatörü authz kapısına TAKILMAZ`, async () => {
      const { service, company, creator, listing, opRole } = await setup();
      const auth = authFor(company, {
        id: creator.id,
        email: creator.email,
        roles: [opRole],
      });
      // İş-mantığı başka sebeple hata verebilir; yalnız authz reddi OLMAMALI.
      expect(await errOf(m.run(service, auth, listing.id))).not.toMatch(DENY);
    });

    it(`${m.name}: ONAYLAYICI (listing:manage yok) REDDEDİLİR`, async () => {
      const { service, company, listing } = await setup();
      const approver = await makeUser(prisma, company.id, [CompanyRole.ONAYLAYICI]);
      const auth = authFor(company, {
        id: approver.id,
        email: approver.email,
        roles: [CompanyRole.ONAYLAYICI],
      });
      await expect(m.run(service, auth, listing.id)).rejects.toThrow(DENY);
    });
  }

  describe("kural dalları (updateListing üzerinden)", () => {
    it("aynı-taraf ama OLUŞTURMAYAN operatör REDDEDİLİR (kural b)", async () => {
      const { service, company, listing, opRole } = await setup("ALIM");
      const other = await makeUser(prisma, company.id, [opRole]); // SATIN_ALMACI, farklı kişi
      const auth = authFor(company, {
        id: other.id,
        email: other.email,
        roles: [opRole],
      });
      await expect(service.updateListing(auth, listing.id, {} as never)).rejects.toThrow(DENY);
    });

    it("yanlış-taraf rol (ALIM'da SATISCI) REDDEDİLİR (kural a)", async () => {
      const { service, company, listing } = await setup("ALIM");
      const seller = await makeUser(prisma, company.id, [CompanyRole.SATISCI]);
      // oluşturan yapılır ki yalnız kural (a) ihlali izole olsun
      await prisma.listing.update({
        where: { id: listing.id },
        data: { createdById: seller.id },
      });
      const auth = authFor(company, {
        id: seller.id,
        email: seller.email,
        roles: [CompanyRole.SATISCI],
      });
      await expect(service.updateListing(auth, listing.id, {} as never)).rejects.toThrow(DENY);
    });

    it("SAHİP başkasının açtığı ilanı YÖNETEMEZ — Kurucu salt-gözlemci (owner istisnası söküldü)", async () => {
      const { service, ownerAuth, listing } = await setup("ALIM");
      // ownerAuth op-rolleri (SA+ST) taşır → izin var; ama oluşturan değil.
      await expect(
        service.updateListing(ownerAuth, listing.id, {} as never),
      ).rejects.toThrow(DENY);
    });

    it("kişi-bazlı izin override ile verilen yetki tanınır", async () => {
      const { service, company, listing } = await setup("ALIM");
      const seller = await makeUser(prisma, company.id, [CompanyRole.SATISCI]);
      await prisma.listing.update({
        where: { id: listing.id },
        data: { createdById: seller.id },
      });
      const base = { id: seller.id, email: seller.email, roles: [CompanyRole.SATISCI] };
      // override YOK → ALIM ilanında sell rolü reddedilir
      await expect(
        service.updateListing(authFor(company, base), listing.id, {} as never),
      ).rejects.toThrow(DENY);
      // override ile buy:listing:manage eklenince authz geçer
      const granted = authFor(company, base, {
        permissionsOverride: { added: ["buy:listing:manage"], removed: [] },
      });
      expect(
        await errOf(service.updateListing(granted, listing.id, {} as never)),
      ).not.toMatch(DENY);
    });

    it("SATIS ilanı taraf-duyarlı: açan SATISCI geçer, SATIN_ALMACI reddedilir", async () => {
      const { service, company, creator, listing, opRole } = await setup("SATIS", "DRAFT");
      const okAuth = authFor(company, {
        id: creator.id,
        email: creator.email,
        roles: [opRole],
      });
      expect(await errOf(service.publishListing(okAuth, listing.id))).not.toMatch(DENY);

      const { service: s2, company: c2, listing: l2 } = await setup("SATIS", "DRAFT");
      const buyer = await makeUser(prisma, c2.id, [CompanyRole.SATIN_ALMACI]);
      await prisma.listing.update({
        where: { id: l2.id },
        data: { createdById: buyer.id },
      });
      const badAuth = authFor(c2, {
        id: buyer.id,
        email: buyer.email,
        roles: [CompanyRole.SATIN_ALMACI],
      });
      await expect(s2.publishListing(badAuth, l2.id)).rejects.toThrow(DENY);
    });
  });

  describe("kazandırma authz — award / awardByItem", () => {
    // OPEN ilan + kalem + başka firmadan SUBMITTED teklif.
    async function withBid(type: ListingType = "ALIM") {
      const base = await setup(type, "OPEN");
      const item = await makeItem(prisma, base.listing.id);
      const bidder = await makeCompanyWithUser(prisma, { country: "TR" });
      const bid = await makeBid(prisma, {
        listingId: base.listing.id,
        bidderCompanyId: bidder.company.id,
        createdById: bidder.user.id,
        amount: 1000,
        items: [{ itemId: item.id, unitPrice: 1000 }],
      });
      return { ...base, item, bidder, bid };
    }

    it("award: ilanı açan doğru-taraf operatörü kazandırabilir", async () => {
      const { service, company, creator, listing, bid, opRole } = await withBid("ALIM");
      const auth = authFor(company, {
        id: creator.id,
        email: creator.email,
        roles: [opRole],
      });
      await service.award(auth, listing.id, bid.id);
      const after = await prisma.listing.findUniqueOrThrow({ where: { id: listing.id } });
      expect(after.status).toBe("AWARDED");
    });

    it("award: aynı-taraf ama OLUŞTURMAYAN operatör REDDEDİLİR", async () => {
      const { service, company, listing, bid, opRole } = await withBid("ALIM");
      const other = await makeUser(prisma, company.id, [opRole]);
      const auth = authFor(company, {
        id: other.id,
        email: other.email,
        roles: [opRole],
      });
      await expect(service.award(auth, listing.id, bid.id)).rejects.toThrow(DENY);
    });

    it("award: SAHİP başkasının açtığı ihaleyi KAZANDIRAMAZ (Kurucu salt-gözlemci)", async () => {
      const { service, ownerAuth, listing, bid } = await withBid("ALIM");
      await expect(service.award(ownerAuth, listing.id, bid.id)).rejects.toThrow(DENY);
      const after = await prisma.listing.findUniqueOrThrow({ where: { id: listing.id } });
      expect(after.status).toBe("OPEN");
    });

    it("awardByItem: oluşturmayan operatör REDDEDİLİR, açan operatör geçer", async () => {
      const { service, company, creator, listing, item, bid, opRole } = await withBid("ALIM");
      const other = await makeUser(prisma, company.id, [opRole]);
      const badAuth = authFor(company, {
        id: other.id,
        email: other.email,
        roles: [opRole],
      });
      await expect(
        service.awardByItem(badAuth, listing.id, [{ itemId: item.id, bidId: bid.id }]),
      ).rejects.toThrow(DENY);

      const okAuth = authFor(company, {
        id: creator.id,
        email: creator.email,
        roles: [opRole],
      });
      expect(
        await errOf(
          service.awardByItem(okAuth, listing.id, [{ itemId: item.id, bidId: bid.id }]),
        ),
      ).not.toMatch(DENY);
    });
  });
});

describe("Taşma koruması — çarpım (birim fiyat × miktar) servis kapısı", () => {
  it("subtotal MAX_MONEY'i aşınca 400 (Postgres 500 değil); faktörler tek başına sınır içinde", async () => {
    const { service, bidder, listing } = await setupAlim();
    // Faktörler tekil tavanların ALTINDA: quantity 1e6 < MAX_QUANTITY(1e9),
    // unitPrice 2e9 < MAX_MONEY(1e15). ÇARPIM 2e15 > MAX_MONEY → taşma.
    const item = await makeItem(prisma, listing.id, {
      lineNo: 9,
      quantity: "1000000",
    });
    await expect(
      service.placeBid(bidder.auth, listing.id, {
        items: [{ itemId: item.id, unitPrice: 2_000_000_000 }],
        deliveryDate: FUTURE.toISOString(),
        validityDays: 30,
      } as never),
    ).rejects.toThrow(/çok büyük/i);
  });

  it("sınır içindeki büyük çarpım kabul (1e3 × 1e9 = 1e12 < MAX_MONEY)", async () => {
    const { service, bidder, listing } = await setupAlim();
    const item = await makeItem(prisma, listing.id, {
      lineNo: 9,
      quantity: "1000",
    });
    const res = await service.placeBid(bidder.auth, listing.id, {
      items: [{ itemId: item.id, unitPrice: 1_000_000_000 }],
      deliveryDate: FUTURE.toISOString(),
      validityDays: 30,
    } as never);
    expect((res as { status: string }).status).toBe("SUBMITTED");
  });
});

describe("closesAt üst sınırı (now + 2 yıl) — auto-close kırılmasın", () => {
  const dtoWith = (closesAt: string) => ({
    type: "ALIM",
    format: "RFQ",
    isInternational: false,
    visibility: "CONNECTIONS",
    title: "Kapanış tavanı",
    closesAt,
    primaryCurrency: "TRY",
    allowedCurrencies: ["TRY"],
    items: [{ name: "Kalem", quantity: 1, unit: "adet" }],
  });

  it("2 yılı aşan closesAt reddedilir (create)", async () => {
    const owner = await makeCompanyWithUser(prisma, {});
    const { service } = makeService();
    const threeYears = new Date(
      Date.now() + 3 * 365 * 24 * 3600 * 1000,
    ).toISOString();
    await expect(
      service.create(owner.auth, dtoWith(threeYears) as never),
    ).rejects.toThrow(/ileri|2 yıl/i);
  });

  it("1 yıl sonrası closesAt kabul edilir (create)", async () => {
    const owner = await makeCompanyWithUser(prisma, {});
    const { service } = makeService();
    const oneYear = new Date(
      Date.now() + 365 * 24 * 3600 * 1000,
    ).toISOString();
    await expect(
      service.create(owner.auth, dtoWith(oneYear) as never),
    ).resolves.toBeDefined();
  });

  it("changeClosingTime da 2 yılı aşan tarihi reddeder (aynı bypass kapatıldı)", async () => {
    const { service, owner, listing } = await setupAlim();
    const threeYears = new Date(
      Date.now() + 3 * 365 * 24 * 3600 * 1000,
    ).toISOString();
    await expect(
      service.changeClosingTime(owner.auth, listing.id, threeYears),
    ).rejects.toThrow(/ileri|2 yıl/i);
  });
});
