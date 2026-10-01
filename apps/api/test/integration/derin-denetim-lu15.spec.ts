/**
 * Derin denetim LU-15 (DÜŞÜK, company-listings) regresyonları:
 *  - kalem görseli yalnız firmanın kendi public deposundan / kataloğundan
 *  - publishListing: 2 yıl tavanı + açılış < kapanış (taslak yolu)
 *  - sahip detayı ETag'i okuyucu diline bağlı
 *  - muadil beyanı marka VEYA parça no ister
 *  - pazarlık monotonluğu yuvarlanmış ara toplamla
 *  - placeBid: teklif satırı ilan kilidi altında yeniden okunur
 *  - kazandırma: tx dışı okunan teklif sürümü guard'da (bayat tutar yok)
 *  - kalem bazlı kazandırmada sipariş sinyali kazanana da gider
 *  - taslak canlandırma yalnız teklif alımı açıkken
 */
import { Prisma } from "@rothern/db";
import { prisma, truncateAll } from "./test-db";
import {
  connect,
  makeBid,
  makeCompanyWithUser,
  makeItem,
  makeListing,
} from "./factories";
import { makeService } from "./make-service";
import { assertOwnProfileImageUrl } from "../../src/common/helpers/upload-validation";
import { runWithLocale } from "../../src/common/i18n/locale-context";

const DAY = 86_400_000;
const future = (d: number) => new Date(Date.now() + d * DAY);

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
  jest.restoreAllMocks();
});

type Svc = ReturnType<typeof makeService>["service"];

/** Rig'de storage yok — gerçek doğrulama kuralıyla (cdn.test + tenant öneki) stub. */
function withStorage(service: Svc) {
  (service as unknown as { storage: unknown }).storage = {
    assertOwnPublicImageUrl: (v: string, tenantId: string) =>
      assertOwnProfileImageUrl(v, {
        tenantPrefix: `test/tenant-profile/${tenantId}/`,
        allowedHosts: ["cdn.test"],
      }),
    deleteObjects: jest.fn(),
    deleteObject: jest.fn(),
  };
  return service;
}

const createDto = (images: string[], over: Record<string, unknown> = {}) => ({
  type: "ALIM",
  format: "RFQ",
  isInternational: false,
  visibility: "CONNECTIONS",
  title: "Görsel doğrulama",
  closesAt: future(3).toISOString(),
  primaryCurrency: "TRY",
  allowedCurrencies: ["TRY"],
  items: [{ name: "Kalem", quantity: 1, unit: "adet", images }],
  ...over,
});

describe("LU-15 — kalem görseli kaynağı", () => {
  it("harici / data: adres reddedilir; kendi deposu ve kendi katalog görseli kabul", async () => {
    const owner = await makeCompanyWithUser(prisma, {});
    const service = withStorage(makeService().service);
    await expect(
      service.create(owner.auth, createDto(["https://tracker.example/p.gif"]) as never),
    ).rejects.toThrow(/kendi profil deponuzdan/);
    await expect(
      service.create(owner.auth, createDto(["data:image/png;base64,AAAA"]) as never),
    ).rejects.toThrow(/Geçersiz görsel adresi/);
    // Başka firmanın deposu da yabancıdır.
    await expect(
      service.create(
        owner.auth,
        createDto(["https://cdn.test/test/tenant-profile/baska-firma/product-1-a.webp"]) as never,
      ),
    ).rejects.toThrow(/kendi profil deponuzdan/);

    const own = `https://cdn.test/test/tenant-profile/${owner.company.id}/product-1-a.webp`;
    await expect(
      service.create(owner.auth, createDto([own]) as never),
    ).resolves.toBeDefined();

    // Katalogdan taşınan (eski/harici) ürün kapağı: KENDİ kataloğundaysa geçer.
    const legacy = "https://legacy.example/urun.jpg";
    await prisma.companyItem.create({
      data: {
        companyId: owner.company.id,
        createdById: owner.user.id,
        name: "Katalog ürünü",
        unit: "adet",
        images: [legacy],
      },
    });
    await expect(
      service.create(owner.auth, createDto([legacy]) as never),
    ).resolves.toBeDefined();
  });

  it("düzenleme: ilanda zaten kayıtlı görsel yeniden doğrulanmaz, yeni harici adres reddedilir", async () => {
    const owner = await makeCompanyWithUser(prisma, {});
    const service = withStorage(makeService().service);
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      status: "DRAFT",
      visibility: "CONNECTIONS",
      format: "RFQ",
    });
    const stored = "https://old-host.example/eski.jpg";
    await makeItem(prisma, listing.id, { images: [stored] });
    await expect(
      service.updateListing(owner.auth, listing.id, createDto([stored]) as never),
    ).resolves.toBeDefined();
    await expect(
      service.updateListing(
        owner.auth,
        listing.id,
        createDto([stored, "https://tracker.example/yeni.gif"]) as never,
      ),
    ).rejects.toThrow(/kendi profil deponuzdan/);
  });
});

describe("LU-15 — publishListing tarih kuralları", () => {
  async function draft(over: Record<string, unknown>) {
    const { service } = makeService();
    const owner = await makeCompanyWithUser(prisma, {});
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      status: "DRAFT",
      visibility: "PUBLIC",
      format: "RFQ",
      ...over,
    });
    await makeItem(prisma, listing.id);
    return { service, owner, listing };
  }

  it("2 yıl tavanını aşan kapanışla taslak yayınlanamaz", async () => {
    const { service, owner, listing } = await draft({ closesAt: future(3 * 365) });
    await expect(service.publishListing(owner.auth, listing.id)).rejects.toThrow(
      /çok ileri/,
    );
    expect((await prisma.listing.findUniqueOrThrow({ where: { id: listing.id } })).status).toBe(
      "DRAFT",
    );
  });

  it("açılışı kapanıştan sonra olan taslak yayınlanamaz", async () => {
    const { service, owner, listing } = await draft({
      closesAt: future(3),
      bidsOpenAt: future(5),
    });
    await expect(service.publishListing(owner.auth, listing.id)).rejects.toThrow(
      /Açılış tarihi kapanıştan önce/,
    );
  });
});

describe("LU-15 — sahip detayı ETag'i dile bağlı", () => {
  it("aynı veri, farklı dil → farklı parmak izi; aynı dilde 304", async () => {
    const { service } = makeService();
    const owner = await makeCompanyWithUser(prisma, {});
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      status: "OPEN",
      closesAt: future(3),
    });
    const etagIn = async (lang: string) =>
      ((await runWithLocale(lang, () => service.getOne(owner.auth, listing.id))) as {
        etag: string;
      }).etag;
    const tr = await etagIn("tr");
    const en = await etagIn("en");
    expect(tr).not.toBe(en);
    const again = (await runWithLocale("en", () =>
      service.getOne(owner.auth, listing.id, en),
    )) as { notModified?: boolean };
    expect(again.notModified).toBe(true);
    const cross = (await runWithLocale("en", () =>
      service.getOne(owner.auth, listing.id, tr),
    )) as { notModified?: boolean };
    expect(cross.notModified).toBeUndefined();
  });
});

describe("LU-15 — teklif kuralları", () => {
  async function rfq() {
    const { service } = makeService();
    const owner = await makeCompanyWithUser(prisma, {});
    const bidder = await makeCompanyWithUser(prisma, {});
    await connect(prisma, owner.company.id, bidder.company.id, owner.user.id);
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      status: "OPEN",
      visibility: "PUBLIC",
      format: "RFQ",
      closesAt: future(3),
    });
    const item = await makeItem(prisma, listing.id, { alternativeAllowed: true });
    return { service, owner, bidder, listing, item };
  }
  const bidDto = (item: Record<string, unknown>, over: Record<string, unknown> = {}) =>
    ({
      items: [{ unitPrice: 100, ...item }],
      deliveryDate: future(10).toISOString(),
      validityDays: 30,
      ...over,
    }) as never;

  it("muadil beyanında marka ve parça no ikisi de boşsa gönderim reddedilir; taslak serbest", async () => {
    const { service, bidder, listing, item } = await rfq();
    await expect(
      service.placeBid(bidder.auth, listing.id, bidDto({ itemId: item.id, isAlternative: true })),
    ).rejects.toThrow(/muadil ürün teklif ediyorsanız/);
    await expect(
      service.placeBid(
        bidder.auth,
        listing.id,
        bidDto({ itemId: item.id, isAlternative: true, offeredBrand: "  " }, { asDraft: true }),
      ),
    ).resolves.toBeDefined();
    await expect(
      service.placeBid(
        bidder.auth,
        listing.id,
        bidDto({ itemId: item.id, isAlternative: true, offeredMpn: "ABC-1" }),
      ),
    ).resolves.toBeDefined();
  });

  it("placeBid: tx dışı okumadan sonra teklif satırı değişmişse Conflict (eşzamanlı gönderim eziyor değil)", async () => {
    const { service, bidder, listing, item } = await rfq();
    const orig = prisma.listingBid.findUnique.bind(prisma.listingBid);
    jest.spyOn(prisma.listingBid, "findUnique").mockImplementation(((args: {
      select?: Record<string, unknown>;
    }) => {
      const p = orig(args as never);
      if (!args.select?.activeBidRound || !args.select?.version) return p;
      // Anlık görüntü alındıktan hemen sonra "öteki istek" commit ediyor.
      return Promise.resolve(p).then(async (snap) => {
        await prisma.listingBid.create({
          data: {
            listingId: listing.id,
            bidderCompanyId: bidder.company.id,
            createdById: bidder.user.id,
            amount: new Prisma.Decimal(60),
            status: "SUBMITTED",
            submittedAt: new Date(),
            activeBidRound: 1,
          },
        });
        return snap;
      });
    }) as never);
    await expect(
      service.placeBid(bidder.auth, listing.id, bidDto({ itemId: item.id, unitPrice: 99 })),
    ).rejects.toThrow(/Teklifiniz bu sırada değişti/);
    jest.restoreAllMocks();
    const b = await prisma.listingBid.findFirstOrThrow({
      where: { listingId: listing.id, bidderCompanyId: bidder.company.id },
    });
    expect(b.amount.toString()).toBe("60");
  });
});

describe("LU-15 — pazarlık monotonluğu yuvarlanmış ara toplamla", () => {
  it("kesirli miktarda AYNI birim fiyat 'daha düşük' sayılmaz", async () => {
    const { service } = makeService();
    const owner = await makeCompanyWithUser(prisma, {});
    const bidder = await makeCompanyWithUser(prisma, {});
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      status: "OPEN",
      visibility: "PUBLIC",
      format: "ENGLISH_AUCTION",
      closesAt: future(7),
      currentRound: 2,
    });
    const item = await makeItem(prisma, listing.id, { quantity: new Prisma.Decimal("1.5") });
    // Kayıtlı tutar roundMoney(1.5 × 10.33 = 15.495) = 15.50.
    await makeBid(prisma, {
      listingId: listing.id,
      bidderCompanyId: bidder.company.id,
      createdById: bidder.user.id,
      amount: "15.50",
      round: 2,
      activeBidRound: 1,
      items: [{ itemId: item.id, unitPrice: "10.33" }],
    });
    const dto = (unitPrice: number) =>
      ({
        items: [{ itemId: item.id, unitPrice }],
        deliveryDate: future(10).toISOString(),
        validityDays: 30,
      }) as never;
    await expect(service.placeBid(bidder.auth, listing.id, dto(10.33))).rejects.toThrow(
      /altında olmalı/,
    );
    await expect(service.placeBid(bidder.auth, listing.id, dto(10.32))).resolves.toBeDefined();
  });
});

describe("LU-15 — kazandırmada bayat teklif tutarı", () => {
  async function setup() {
    const made = makeService();
    const owner = await makeCompanyWithUser(prisma, {});
    const bidder = await makeCompanyWithUser(prisma, {});
    await connect(prisma, owner.company.id, bidder.company.id, owner.user.id);
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      status: "OPEN",
      format: "RFQ",
      closesAt: future(3),
    });
    const item = await makeItem(prisma, listing.id, { quantity: new Prisma.Decimal(1) });
    const bid = await makeBid(prisma, {
      listingId: listing.id,
      bidderCompanyId: bidder.company.id,
      createdById: bidder.user.id,
      amount: 100000,
      items: [{ itemId: item.id, unitPrice: 100000 }],
    });
    return { service: made.service, owner, bidder, listing, item, bid };
  }

  /** Teklif okunduktan hemen sonra "yeniden gönderim" commit eder (version++). */
  async function rebidAfterRead(bidId: string, itemId: string) {
    await prisma.listingBid.update({
      where: { id: bidId },
      data: { amount: new Prisma.Decimal(90000), version: { increment: 1 } },
    });
    await prisma.listingBidItem.updateMany({
      where: { bidId, itemId },
      data: { unitPrice: new Prisma.Decimal(90000) },
    });
  }

  it("toplu kazandırma: okuma sonrası yeniden gönderilen teklife bayat tutarla sipariş yazılmaz", async () => {
    const { service, owner, listing, item, bid } = await setup();
    const orig = prisma.listingBid.findUnique.bind(prisma.listingBid);
    jest.spyOn(prisma.listingBid, "findUnique").mockImplementation(((args: {
      where?: { id?: string };
      select?: Record<string, unknown>;
    }) => {
      const p = orig(args as never);
      if (args.where?.id !== bid.id || !args.select?.version || !args.select?.items) return p;
      return Promise.resolve(p).then(async (snap) => {
        await rebidAfterRead(bid.id, item.id);
        return snap;
      });
    }) as never);
    await expect(service.award(owner.auth, listing.id, bid.id)).rejects.toThrow(
      /Teklif artık geçerli değil/,
    );
    jest.restoreAllMocks();
    expect(await prisma.companyOrder.count({ where: { listingId: listing.id } })).toBe(0);
    expect((await prisma.listingBid.findUniqueOrThrow({ where: { id: bid.id } })).status).toBe(
      "SUBMITTED",
    );
  });

  it("kalem bazlı kazandırma: aynı guard", async () => {
    const { service, owner, listing, item, bid } = await setup();
    const orig = prisma.listingBid.findMany.bind(prisma.listingBid);
    // buildItemGroups iki kez koşar: onay eşiği (itemAwardTotal) ve
    // runItemAward — pencere SONUNCU okuma ile tx arasında.
    let reads = 0;
    let fired = false;
    jest.spyOn(prisma.listingBid, "findMany").mockImplementation(((args: {
      select?: Record<string, unknown>;
    }) => {
      const p = orig(args as never);
      if (!args.select?.version || !args.select?.exchangeRateSnapshot) return p;
      if (++reads !== 2) return p;
      fired = true;
      return Promise.resolve(p).then(async (rows) => {
        await rebidAfterRead(bid.id, item.id);
        return rows;
      });
    }) as never);
    await expect(
      service.awardByItem(owner.auth, listing.id, [{ itemId: item.id, bidId: bid.id }]),
    ).rejects.toThrow(/Kazanan tekliflerden biri artık geçerli değil/);
    jest.restoreAllMocks();
    expect(fired).toBe(true);
    expect(await prisma.companyOrder.count({ where: { listingId: listing.id } })).toBe(0);
  });

  it("kalem bazlı kazandırmada sipariş sinyali kazanan teklifçiye de gider", async () => {
    const { service, owner, bidder, listing, item, bid } = await setup();
    const pingOrder = jest.fn();
    (service as unknown as { realtime: unknown }).realtime = new Proxy(
      { pingOrder },
      { get: (t, k) => (k in t ? t[k as keyof typeof t] : jest.fn()) },
    );
    const res = (await service.awardByItem(owner.auth, listing.id, [
      { itemId: item.id, bidId: bid.id },
    ])) as { orders: { id: string }[] };
    expect(pingOrder).toHaveBeenCalledWith(
      res.orders[0]!.id,
      expect.arrayContaining([owner.company.id, bidder.company.id]),
    );
  });
});

describe("LU-15 — taslak canlandırma yalnız teklif alımı açıkken", () => {
  async function draftCarried(over: Record<string, unknown>) {
    const { service } = makeService();
    const owner = await makeCompanyWithUser(prisma, {});
    const bidder = await makeCompanyWithUser(prisma, {});
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      visibility: "PUBLIC",
      format: "RFQ",
      ...over,
    });
    // LAZY taşıma: submittedAt/validityDays korunmuş, DRAFT, güncel tur.
    await makeBid(prisma, {
      listingId: listing.id,
      bidderCompanyId: bidder.company.id,
      createdById: bidder.user.id,
      amount: 500,
      status: "DRAFT",
      submittedAt: new Date(Date.now() - 5 * DAY),
      validityDays: 30,
    });
    return { service, bidder, listing };
  }

  it("kapanış sonrası (IN_AWARD) taslak canlanmaz", async () => {
    const { service, bidder, listing } = await draftCarried({
      status: "IN_AWARD",
      closesAt: new Date(Date.now() - 3600_000),
    });
    await expect(service.extendBidValidity(bidder.auth, listing.id, 1)).rejects.toThrow(
      /Talep teklife kapalı/,
    );
    const b = await prisma.listingBid.findFirstOrThrow({ where: { listingId: listing.id } });
    expect(b.status).toBe("DRAFT");
  });

  it("açılış embargosunda taslak canlanmaz; açık talepte canlanır", async () => {
    const embargo = await draftCarried({
      status: "OPEN",
      closesAt: future(5),
      bidsOpenAt: future(1),
    });
    await expect(
      embargo.service.extendBidValidity(embargo.bidder.auth, embargo.listing.id, 1),
    ).rejects.toThrow(/henüz başlamadı/);
    await prisma.listing.update({
      where: { id: embargo.listing.id },
      data: { bidsOpenAt: null },
    });
    await expect(
      embargo.service.extendBidValidity(embargo.bidder.auth, embargo.listing.id, 1),
    ).resolves.toMatchObject({ revived: true });
  });
});
