/**
 * placeBid — görünürlük/uygunluk (PRIVATE/CONNECTIONS/PUBLIC), rol (işleme göre),
 * para birimi izin listesi + FX snapshot, requireAllItems.
 */
import { CompanyRole } from "@rothern/db";
import { prisma, truncateAll } from "./test-db";
import {
  connect,
  invite,
  makeCompanyWithUser,
  makeItem,
  makeListing,
} from "./factories";
import { makeService } from "./make-service";

const FUTURE = new Date(Date.now() + 7 * 24 * 3600 * 1000);

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

async function listingWithItem(over: Record<string, unknown> = {}) {
  const { service } = makeService();
  const owner = await makeCompanyWithUser(prisma, { country: "TR" });
  const listing = await makeListing(prisma, {
    companyId: owner.company.id,
    createdById: owner.user.id,
    type: "ALIM",
    status: "OPEN",
    visibility: "PUBLIC",
    closesAt: FUTURE,
    ...over,
  });
  const item = await makeItem(prisma, listing.id);
  return { service, owner, listing, item };
}

const bid = (itemId: string, unitPrice = 100, extra: Record<string, unknown> = {}) =>
  ({
    items: [{ itemId, unitPrice }],
    deliveryDate: FUTURE.toISOString(),
    validityDays: 30,
    ...extra,
  }) as never;

describe("placeBid — görünürlük/uygunluk", () => {
  it("PRIVATE: yalnız davetli teklif verebilir", async () => {
    const { service, owner, listing, item } = await listingWithItem({
      visibility: "PRIVATE",
    });
    const outsider = await makeCompanyWithUser(prisma, { country: "TR" });
    await expect(
      service.placeBid(outsider.auth, listing.id, bid(item.id)),
    ).rejects.toThrow();

    const guest = await makeCompanyWithUser(prisma, { country: "TR" });
    await invite(prisma, listing.id, guest.company.id, owner.user.id);
    await expect(
      service.placeBid(guest.auth, listing.id, bid(item.id)),
    ).resolves.toBeDefined();
  });

  it("CONNECTIONS: yalnız bağlı firma teklif verebilir", async () => {
    const { service, owner, listing, item } = await listingWithItem({
      visibility: "CONNECTIONS",
    });
    const stranger = await makeCompanyWithUser(prisma, { country: "TR" });
    await expect(
      service.placeBid(stranger.auth, listing.id, bid(item.id)),
    ).rejects.toThrow();

    const partner = await makeCompanyWithUser(prisma, { country: "TR" });
    await connect(prisma, owner.company.id, partner.company.id, owner.user.id);
    await expect(
      service.placeBid(partner.auth, listing.id, bid(item.id)),
    ).resolves.toBeDefined();
  });

  it("PUBLIC: STANDARD + bağsız firma teklif veremez (premium gerekir)", async () => {
    const { service, listing, item } = await listingWithItem({
      visibility: "PUBLIC",
    });
    const free = await makeCompanyWithUser(prisma, {
      country: "TR",
      tier: "STANDART",
    });
    await expect(
      service.placeBid(free.auth, listing.id, bid(item.id)),
    ).rejects.toThrow();
  });

  it("rol: ALIM ilanına teklif için SATISCI rolü gerekir", async () => {
    const { service, listing, item } = await listingWithItem();
    const buyerOnly = await makeCompanyWithUser(prisma, {
      country: "TR",
      roles: [CompanyRole.SATIN_ALMACI],
    });
    await expect(
      service.placeBid(buyerOnly.auth, listing.id, bid(item.id)),
    ).rejects.toThrow(/rol|Satışçı/i);
  });

  it("Faz R: SAHIP-only teklif VEREMEZ (etiket op-izin vermez); SAHIP+ST verir", async () => {
    const { service, listing, item } = await listingWithItem();
    // Yalnız SAHIP (op-rol yok) → rol kapısına takılır.
    const soloFounder = await makeCompanyWithUser(prisma, {
      country: "TR",
      roles: [CompanyRole.SAHIP],
    });
    await expect(
      service.placeBid(soloFounder.auth, listing.id, bid(item.id)),
    ).rejects.toThrow(/Satışçı rolü gerekir/);

    // Kurucu kendine ST eklerse (yeni model) teklif verebilir.
    const opFounder = await makeCompanyWithUser(prisma, {
      country: "TR",
      roles: [CompanyRole.SAHIP, CompanyRole.SATISCI],
    });
    await service.placeBid(opFounder.auth, listing.id, bid(item.id));
    const count = await prisma.listingBid.count({
      where: { listingId: listing.id, bidderCompanyId: opFounder.company.id },
    });
    expect(count).toBe(1);
  });
});

describe("placeBid — para birimi & kalem zorunluluğu", () => {
  it("izin verilmeyen para birimi reddedilir", async () => {
    const { service, listing, item } = await listingWithItem({
      allowedCurrencies: ["TRY"],
    });
    const bidder = await makeCompanyWithUser(prisma, { country: "TR" });
    await expect(
      service.placeBid(
        bidder.auth,
        listing.id,
        bid(item.id, 100, { currency: "USD" }),
      ),
    ).rejects.toThrow(/para birimi/i);
  });

  it("TRY dışı teklif kur snapshot'ı saklar", async () => {
    const { service, listing, item } = await listingWithItem({
      allowedCurrencies: ["TRY", "USD"],
    });
    const bidder = await makeCompanyWithUser(prisma, { country: "TR" });
    await service.placeBid(
      bidder.auth,
      listing.id,
      bid(item.id, 100, { currency: "USD" }),
    );
    const stored = await prisma.listingBid.findFirstOrThrow({
      where: { listingId: listing.id, bidderCompanyId: bidder.company.id },
    });
    expect(stored.currency).toBe("USD");
    expect(stored.exchangeRateSnapshot).not.toBeNull();
  });

  it("requireAllItems: eksik kalem reddedilir", async () => {
    const { service, listing, item } = await listingWithItem({
      requireAllItems: true,
    });
    await makeItem(prisma, listing.id, { lineNo: 2 }); // ikinci kalem
    const bidder = await makeCompanyWithUser(prisma, { country: "TR" });
    await expect(
      service.placeBid(bidder.auth, listing.id, bid(item.id)),
    ).rejects.toThrow(/tüm kalem/i);
  });
});
