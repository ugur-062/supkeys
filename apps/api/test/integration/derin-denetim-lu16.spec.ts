/**
 * Derin denetim LU-16 (DÜŞÜK — company-listings, company-orders,
 * company-profile) regresyonları:
 *  - AI üye davetinde İngiliz usulü "kapanışa 2 dk kala davet yok" koruması
 *  - embargodaki talepte iptal / kapanış bildirimi yalnız teklif sahiplerine
 *  - sipariş reddi + kazandırmayı geri alma TEK transaction (yarım ret yok)
 *  - geri alma kalem kısmi kazandırma miktarını sıfırlar
 *  - vade hatırlatması keyset sayfalama (batch sınırında aday atlanmaz)
 *  - vade hatırlatması bildirim hatasında damga geri alınır
 *  - sipariş listesi/detayında karşı firmanın talep başlığı/kalemleri çevrilir
 *  - firma adı yalnız boşluktan oluşamaz
 */
import { Prisma } from "@rothern/db";
import { CompanyOrdersService } from "../../src/modules/company-orders/services/company-orders.service";
import { CompanyProfileService } from "../../src/modules/company-profile/company-profile.service";
import { AuditService } from "../../src/modules/audit/audit.service";
import { NotificationService } from "../../src/modules/notifications/notification.service";
import { prisma, truncateAll } from "./test-db";
import { makeBid, makeCompanyWithUser, makeItem, makeListing } from "./factories";
import { makeService } from "./make-service";

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

function makeOrdersService(translations?: unknown) {
  const email = { send: jest.fn().mockResolvedValue({ emailLogId: "test", sent: true }) };
  const config = { get: jest.fn().mockReturnValue("http://localhost:3000") };
  const notifications = new NotificationService(prisma as never);
  const service = new CompanyOrdersService(
    prisma as never,
    email as never,
    config as never,
    notifications,
    new AuditService(prisma as never),
    prisma as never,
    undefined,
    translations as never,
  );
  return { service, notifications };
}

describe("LU-16 — AI üye daveti son saniye koruması", () => {
  it("açık İngiliz usulü eksiltmede kapanışa 2 dk'dan az kala AI daveti reddedilir", async () => {
    const { service } = makeService();
    const owner = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const target = await makeCompanyWithUser(prisma, { tier: "SILVER" });
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      status: "OPEN",
      visibility: "PRIVATE",
      format: "ENGLISH_AUCTION",
      closesAt: new Date(Date.now() + 40_000),
      publishedAt: new Date(),
    });
    await expect(
      service.inviteDiscoveredMembers(owner.auth, listing.id, [target.company.id]),
    ).rejects.toThrow(/2 dakikadan az kala/);
    expect(await prisma.listingInvitation.count({ where: { listingId: listing.id } })).toBe(0);
  });
});

describe("LU-16 — embargodaki talepte katılımcı bildirimleri", () => {
  async function embargoSetup() {
    const owner = await makeCompanyWithUser(prisma, {});
    const invitee = await makeCompanyWithUser(prisma, {});
    const bidder = await makeCompanyWithUser(prisma, {});
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      status: "OPEN",
      visibility: "PRIVATE",
      bidsOpenAt: future(3),
      closesAt: future(6),
      publishedAt: new Date(),
    });
    await prisma.listingInvitation.create({
      data: { listingId: listing.id, invitedCompanyId: invitee.company.id, invitedById: owner.user.id },
    });
    // Önceki turun katılımcısı: embargoda da talebi görür (getOne istisnası).
    await makeBid(prisma, {
      listingId: listing.id,
      bidderCompanyId: bidder.company.id,
      createdById: bidder.user.id,
      amount: 100,
    });
    return { owner, invitee, bidder, listing };
  }

  it("iptal bildirimi talebi göremeyen davetliye gitmez, teklif sahibine gider", async () => {
    const { service } = makeService();
    const { invitee, bidder, listing } = await embargoSetup();
    await service.notifyListingParticipants(listing.id, {
      subjectKey: "api.notifications.listings.cancelled.title",
      headingKey: "api.notifications.listings.cancelled.title",
      bodyKey: "api.notifications.listings.cancelled.body",
      params: { hasReason: "no", reason: "" },
      type: "listing_closed",
    });
    expect(await prisma.notification.count({ where: { companyId: invitee.company.id } })).toBe(0);
    expect(await prisma.notification.count({ where: { companyId: bidder.company.id } })).toBe(1);
  });

  it("Değerlendirmeye Al kapanış bildirimi embargoda yalnız teklif sahiplerine; embargo bitince davetlilere de", async () => {
    const { service } = makeService();
    const { invitee, bidder, listing } = await embargoSetup();
    await service.notifyListingClosed(listing.id, { skipOwner: true });
    expect(await prisma.notification.count({ where: { companyId: invitee.company.id } })).toBe(0);
    expect(await prisma.notification.count({ where: { companyId: bidder.company.id } })).toBe(1);

    await prisma.listing.update({ where: { id: listing.id }, data: { bidsOpenAt: new Date(Date.now() - 1000) } });
    await service.notifyListingClosed(listing.id, { skipOwner: true });
    expect(await prisma.notification.count({ where: { companyId: invitee.company.id } })).toBe(1);
  });
});

describe("LU-16 — sipariş reddi + kazandırma geri alma atomik", () => {
  async function awarded() {
    const seller = await makeCompanyWithUser(prisma, { country: "TR" });
    const buyer = await makeCompanyWithUser(prisma, { country: "TR" });
    const listing = await makeListing(prisma, {
      companyId: buyer.company.id,
      createdById: buyer.user.id,
      status: "AWARDED",
    });
    await prisma.listing.update({ where: { id: listing.id }, data: { awardedAt: new Date() } });
    const item = await makeItem(prisma, listing.id, {
      quantity: new Prisma.Decimal(100),
      awardedQuantity: new Prisma.Decimal(30),
    });
    const won = await makeBid(prisma, {
      listingId: listing.id,
      bidderCompanyId: seller.company.id,
      createdById: seller.user.id,
      amount: 1000,
      status: "AWARDED_PARTIAL",
    });
    const order = await prisma.companyOrder.create({
      data: {
        sellerCompanyId: seller.company.id,
        buyerCompanyId: buyer.company.id,
        listingId: listing.id,
        amount: 1000,
        status: "PENDING",
        paymentTiming: "AFTER_DELIVERY",
      } as never,
    });
    return { seller, buyer, listing, item, won, order };
  }

  it("geri alma düşerse ret de geri alınır (sipariş PENDING kalır), yeniden deneme başarır", async () => {
    const { service } = makeOrdersService();
    const { seller, listing, won, order } = await awarded();
    const spy = jest
      .spyOn(service as unknown as { revertAwardInTx: () => Promise<unknown> }, "revertAwardInTx")
      .mockRejectedValueOnce(new Error("connection reset"));
    await expect(service.reject(seller.auth, order.id, "stok kalmadı, üzgünüz")).rejects.toThrow(
      /connection reset/,
    );
    expect((await prisma.companyOrder.findUniqueOrThrow({ where: { id: order.id } })).status).toBe(
      "PENDING",
    );
    expect((await prisma.listingBid.findUniqueOrThrow({ where: { id: won.id } })).status).toBe(
      "AWARDED_PARTIAL",
    );
    spy.mockRestore();

    await service.reject(seller.auth, order.id, "stok kalmadı, üzgünüz");
    expect((await prisma.companyOrder.findUniqueOrThrow({ where: { id: order.id } })).status).toBe(
      "REJECTED",
    );
    expect((await prisma.listing.findUniqueOrThrow({ where: { id: listing.id } })).status).toBe(
      "IN_AWARD",
    );
    expect(
      await prisma.auditLog.count({
        where: { action: "company.listing.award_reverted_on_rejection", entityId: listing.id },
      }),
    ).toBe(1);
  });

  it("talep yeniden açılınca kalem bazlı kısmi kazandırma miktarı sıfırlanır", async () => {
    const { service } = makeOrdersService();
    const { seller, item, order } = await awarded();
    await service.reject(seller.auth, order.id, "kapasite yetersiz kaldı");
    const it = await prisma.listingItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(it.awardedQuantity).toBeNull();
  });
});

describe("LU-16 — vade hatırlatması cron'u", () => {
  const dueOrder = (sellerCompanyId: string, buyerCompanyId: string) => ({
    sellerCompanyId,
    buyerCompanyId,
    status: "DELIVERED",
    deliveredAt: future(-58),
    paymentTiming: "AFTER_DELIVERY",
    paymentCategory: "DEFERRED",
    paymentDays: 60,
    amount: 1000,
  });

  it("batch sınırında damgalanan son aday bir sonraki uygun siparişi atlatmaz (keyset)", async () => {
    const seller = await makeCompanyWithUser(prisma, { country: "TR" });
    const buyer = await makeCompanyWithUser(prisma, { country: "TR" });
    // BATCH=500 → 502 aday: eski `cursor+skip:1` 501.'yi atlıyordu.
    await prisma.companyOrder.createMany({
      data: Array.from({ length: 502 }, () => dueOrder(seller.company.id, buyer.company.id)) as never,
    });
    const { service, notifications } = makeOrdersService();
    jest.spyOn(notifications, "pushToCompany").mockResolvedValue(undefined as never);
    const sent = await service.sendDuePaymentReminders();
    expect(sent).toBe(502);
    expect(
      await prisma.companyOrder.count({ where: { paymentDueReminderSentAt: null } }),
    ).toBe(0);
  }, 60_000);

  it("bildirim hatasında damga geri alınır, sayaç artmaz; sonraki koşum yeniden dener", async () => {
    const seller = await makeCompanyWithUser(prisma, { country: "TR" });
    const buyer = await makeCompanyWithUser(prisma, { country: "TR" });
    const order = await prisma.companyOrder.create({
      data: dueOrder(seller.company.id, buyer.company.id) as never,
    });
    const { service, notifications } = makeOrdersService();
    const push = jest
      .spyOn(notifications, "pushToCompany")
      .mockRejectedValueOnce(new Error("db down"));
    expect(await service.sendDuePaymentReminders()).toBe(0);
    expect(
      (await prisma.companyOrder.findUniqueOrThrow({ where: { id: order.id } }))
        .paymentDueReminderSentAt,
    ).toBeNull();
    push.mockRestore();
    expect(await service.sendDuePaymentReminders()).toBe(1);
    expect(
      (await prisma.companyOrder.findUniqueOrThrow({ where: { id: order.id } }))
        .paymentDueReminderSentAt,
    ).not.toBeNull();
  });
});

describe("LU-16 — sipariş listesi/detayında karşı firmanın talep içeriği çevrilir", () => {
  it("satıcı alıcının talep başlığını ve kalem adlarını çeviriden okur; alıcı kendi talebini ham görür", async () => {
    const translations = {
      localizeIndustry: jest.fn(async (items: unknown[]) => items),
      localizeListings: jest.fn(
        async (items: { title: string; items?: { name: string }[] }[]) =>
          items.map((i) => ({
            ...i,
            title: `EN ${i.title}`,
            ...(i.items ? { items: i.items.map((x) => ({ name: `EN ${x.name}` })) } : {}),
          })),
      ),
    };
    const { service } = makeOrdersService(translations);
    const seller = await makeCompanyWithUser(prisma, { country: "TR" });
    const buyer = await makeCompanyWithUser(prisma, { country: "TR" });
    const listing = await makeListing(prisma, {
      companyId: buyer.company.id,
      createdById: buyer.user.id,
      status: "AWARDED",
      title: "Çelik boru alımı",
    });
    const order = await prisma.companyOrder.create({
      data: {
        sellerCompanyId: seller.company.id,
        buyerCompanyId: buyer.company.id,
        listingId: listing.id,
        amount: 1000,
        status: "PENDING",
        paymentTiming: "AFTER_DELIVERY",
        items: {
          create: [{ name: "Çelik boru", quantity: 10, unit: "adet", unitPrice: 100 }],
        },
      } as never,
    });

    const sellerList = await service.list(seller.auth);
    expect(sellerList[0]!.listingTitle).toBe("EN Çelik boru alımı");
    const sellerDetail = await service.getOne(seller.auth, order.id);
    expect(sellerDetail.listingTitle).toBe("EN Çelik boru alımı");
    expect(sellerDetail.items[0]!.name).toBe("EN Çelik boru");

    translations.localizeListings.mockClear();
    const buyerList = await service.list(buyer.auth);
    expect(buyerList[0]!.listingTitle).toBe("Çelik boru alımı");
    const buyerDetail = await service.getOne(buyer.auth, order.id);
    expect(buyerDetail.listingTitle).toBe("Çelik boru alımı");
    expect(buyerDetail.items[0]!.name).toBe("Çelik boru");
    expect(translations.localizeListings).not.toHaveBeenCalled();
  });
});

describe("LU-16 — firma adı yalnız boşluktan oluşamaz", () => {
  it("kırpılmış ad 2 karakterden kısaysa reddedilir, ad değişmez", async () => {
    const svc = new CompanyProfileService(
      prisma as never,
      { deleteObject: jest.fn() } as never,
      {} as never,
      new AuditService(prisma as never),
    );
    const owner = await makeCompanyWithUser(prisma, {
      country: "TR",
      companyVerificationStatus: "UNVERIFIED",
    });
    await expect(svc.update(owner.company.id, { name: "   " } as never)).rejects.toThrow(
      /en az 2 karakter/,
    );
    await expect(svc.update(owner.company.id, { name: " a " } as never)).rejects.toThrow(
      /en az 2 karakter/,
    );
    const c = await prisma.company.findUniqueOrThrow({ where: { id: owner.company.id } });
    expect(c.name).toBe(owner.company.name);
    await svc.update(owner.company.id, { name: "  Yeni Ad  " } as never);
    expect((await prisma.company.findUniqueOrThrow({ where: { id: owner.company.id } })).name).toBe(
      "Yeni Ad",
    );
  });
});
