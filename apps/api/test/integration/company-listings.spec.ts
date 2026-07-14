/**
 * company-listings (ihaleler) — integration testleri (gerçek Postgres, izole
 * rothern_test şeması). Denetimde bulunan kritik güvenlik/doğruluk noktalarını
 * kapsar: kapalı zarf, ülke görünürlüğü, IDOR/owner-scope, teklif kapıları
 * (F2/F3/F6), kazandırma→sipariş doğruluğu, çift-kazandırma (F1), kalem-bazlı
 * (F8), state-machine.
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

    // LC-Usance → BEFORE_DELIVERY; teminat bayrağı LC'de false'a normalize.
    const lc = await service.create(
      owner.auth,
      dto({
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

    // VESAİK MUKABİLİ: ek zorunlu alan yok; belge karşılığı → BEFORE_DELIVERY.
    const cad = await service.create(
      owner.auth,
      dto({ paymentCategory: "CASH_AGAINST_DOCS" }) as never,
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
