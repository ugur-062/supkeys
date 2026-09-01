import { Prisma } from "@prisma/client";
import { prisma, truncateAll } from "./test-db";
import { makeCompanyWithUser, makeListing, makeItem } from "./factories";
import { makeService } from "./make-service";

/**
 * KYC kapısının YERİ (2026-09-01 revizyonu).
 *
 * Prensip: doğrulama, PLATFORMUN KEFİL OLDUĞU yerde istenir.
 *  · Alıcı firmayı kendi davet ettiyse / bağlantı varsa → platform araya
 *    girmiyor → BELGE İSTENMEZ.
 *  · PUBLIC talebe tanımadan erişildiyse → oraya sokan platform → istenir.
 *
 * Eski hâli her teklifte belge istiyordu ve en kötü anda çarpıyordu
 * (40 kalem fiyatlandıktan sonra "Gönder"de 403).
 */
describe("Teklifte KYC kapısı", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  async function setup(opts: {
    visibility: "PUBLIC" | "CONNECTIONS" | "PRIVATE";
    sellerVerified: boolean;
    sellerTier?: "STANDART" | "BRONZ";
  }) {
    const buyer = await makeCompanyWithUser(prisma);
    const seller = await makeCompanyWithUser(prisma, {
      tier: opts.sellerTier ?? "STANDART",
      companyVerificationStatus: opts.sellerVerified ? "VERIFIED" : "PENDING",
    });
    const listing = await makeListing(prisma, {
      companyId: buyer.company.id,
      createdById: buyer.user.id,
      type: "ALIM",
      status: "OPEN",
      visibility: opts.visibility,
    });
    const item = await makeItem(prisma, listing.id, {
      quantity: new Prisma.Decimal(1),
    });
    return { buyer, seller, listing, item };
  }

  const bid = (svc: ReturnType<typeof makeService>["service"], s: never, l: string, i: string) =>
    svc.placeBid(s, l, {
      amount: 100,
      currency: "TRY",
      deliveryTime: "W1_2",
      validityDays: 30,
      items: [{ itemId: i, unitPrice: 100 }],
    } as never);

  async function connect(a: string, b: string, inviterUserId: string) {
    await prisma.companyConnection.create({
      data: {
        inviterCompanyId: a,
        inviteeCompanyId: b,
        invitedById: inviterUserId,
        status: "ACTIVE",
      },
    });
  }

  it("DAVETLİ firma DOĞRULANMADAN teklif gönderebilir", async () => {
    const { service } = makeService();
    const { buyer, seller, listing, item } = await setup({
      visibility: "PRIVATE",
      sellerVerified: false,
    });
    await prisma.listingInvitation.create({
      data: {
        listingId: listing.id,
        invitedCompanyId: seller.company.id,
        invitedById: buyer.user.id,
      },
    });
    await expect(
      bid(service, seller.auth as never, listing.id, item.id),
    ).resolves.toBeDefined();
  });

  it("BAĞLANTILI firma DOĞRULANMADAN teklif gönderebilir", async () => {
    const { service } = makeService();
    const { buyer, seller, listing, item } = await setup({
      visibility: "CONNECTIONS",
      sellerVerified: false,
    });
    await connect(buyer.company.id, seller.company.id, buyer.user.id);
    await expect(
      bid(service, seller.auth as never, listing.id, item.id),
    ).resolves.toBeDefined();
  });

  it("PUBLIC talebe TANIMADAN erişen firma doğrulama İSTER", async () => {
    const { service } = makeService();
    // Paketli ama doğrulanmamış (admin elle tier vermiş olabilir) → kapı tutar.
    const { seller, listing, item } = await setup({
      visibility: "PUBLIC",
      sellerVerified: false,
      sellerTier: "BRONZ",
    });
    await expect(
      bid(service, seller.auth as never, listing.id, item.id),
    ).rejects.toThrow(/doğrulama/i);
  });

  it("PUBLIC + doğrulanmış → geçer", async () => {
    const { service } = makeService();
    const { seller, listing, item } = await setup({
      visibility: "PUBLIC",
      sellerVerified: true,
      sellerTier: "BRONZ",
    });
    await expect(
      bid(service, seller.auth as never, listing.id, item.id),
    ).resolves.toBeDefined();
  });

  it("alıcı, doğrulanmamış teklif verenin durumunu GÖREBİLİR", async () => {
    // Rozetin kaynağı: kazandırmadan önce alıcı kör kalmamalı.
    const { service } = makeService();
    const { buyer, seller, listing, item } = await setup({
      visibility: "CONNECTIONS",
      sellerVerified: false,
    });
    await connect(buyer.company.id, seller.company.id, buyer.user.id);
    await bid(service, seller.auth as never, listing.id, item.id);
    const detail = (await service.getOne(buyer.auth, listing.id)) as {
      bids: { bidderVerified: boolean }[];
    };
    expect(detail.bids).toHaveLength(1);
    expect(detail.bids[0]!.bidderVerified).toBe(false);
  });
});
