/**
 * Faz T kabul — STANDART maskeli-önizleme (freemium):
 * STANDART, PUBLIC ihaleyi LİSTEDE görür + detayı MASKELİ açar (404 değil) ama
 * teklif VEREMEZ; davet/bağlantı → tam görünüm + teklif. BRONZ+ → PUBLIC
 * maskesiz + teklif. Formüllerin tek kaynağı listingBidEligibility
 * (listing-visibility.ts) — getOne/sellerTenders/placeBid aynı kuralı okur.
 */
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

const bid = (itemId: string, unitPrice = 100) =>
  ({
    items: [{ itemId, unitPrice }],
    deliveryDate: FUTURE.toISOString(),
    validityDays: 30,
  }) as never;

async function publicListing(type: "ALIM" | "SATIS" = "ALIM") {
  const owner = await makeCompanyWithUser(prisma, { country: "TR" });
  const listing = await makeListing(prisma, {
    companyId: owner.company.id,
    createdById: owner.user.id,
    type,
    status: "OPEN",
    visibility: "PUBLIC",
    closesAt: FUTURE,
  });
  const item = await makeItem(prisma, listing.id);
  return { owner, listing, item };
}

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

describe("Faz T — STANDART maskeli önizleme + teklif kapısı", () => {
  it("STANDART: PUBLIC listede VAR + masked:true + canBid:false; detay maskeli (404 değil)", async () => {
    const { service } = makeService();
    const { listing } = await publicListing();
    const std = await makeCompanyWithUser(prisma, {
      country: "TR",
      tier: "STANDART",
    });

    const rows = (await service.sellerTenders(std.auth)) as {
      id: string;
      masked: boolean;
      canBid: boolean;
    }[];
    const row = rows.find((r) => r.id === listing.id);
    expect(row).toBeTruthy(); // listeden DÜŞMEZ (freemium önizleme)
    expect(row!.masked).toBe(true);
    expect(row!.canBid).toBe(false);

    const detail = (await service.getOne(std.auth, listing.id)) as {
      masked: boolean;
      canBid: boolean;
      auctionView: unknown;
    };
    expect(detail.masked).toBe(true); // 404 DEĞİL — maskeli detay
    expect(detail.canBid).toBe(false);
    expect(detail.auctionView).toBeNull(); // maskede hassas bölümler kapalı
  });

  it("STANDART bağlantısız PUBLIC'e placeBid → 403 (teklif kapısı)", async () => {
    const { service } = makeService();
    const { listing, item } = await publicListing(); // ALIM → teklifçi ST rolü ister
    const std = await makeCompanyWithUser(prisma, {
      country: "TR",
      tier: "STANDART",
    });
    await expect(
      service.placeBid(std.auth, listing.id, bid(item.id)),
    ).rejects.toThrow(/premium|paket|bağlantı/i);
  });

  it("STANDART davet edilince TAM görür + teklif verir", async () => {
    const { service } = makeService();
    const { owner, listing, item } = await publicListing();
    const std = await makeCompanyWithUser(prisma, {
      country: "TR",
      tier: "STANDART",
    });
    await invite(prisma, listing.id, std.company.id, owner.user.id);

    const detail = (await service.getOne(std.auth, listing.id)) as {
      masked: boolean;
      canBid: boolean;
    };
    expect(detail.masked).toBe(false);
    expect(detail.canBid).toBe(true);
    await expect(
      service.placeBid(std.auth, listing.id, bid(item.id)),
    ).resolves.toBeDefined();
  });

  it("STANDART bağlantısının ihalesini TAM görür + teklif verir", async () => {
    const { service } = makeService();
    const { owner, listing, item } = await publicListing();
    const std = await makeCompanyWithUser(prisma, {
      country: "TR",
      tier: "STANDART",
    });
    await connect(prisma, owner.company.id, std.company.id, owner.user.id);

    const detail = (await service.getOne(std.auth, listing.id)) as {
      masked: boolean;
      canBid: boolean;
    };
    expect(detail.masked).toBe(false);
    expect(detail.canBid).toBe(true);
    await expect(
      service.placeBid(std.auth, listing.id, bid(item.id)),
    ).resolves.toBeDefined();
  });

  it("BRONZ aynı PUBLIC'i MASKESIZ görür + teklif verir (yeni kademe eşiği)", async () => {
    const { service } = makeService();
    const { listing, item } = await publicListing();
    const bronz = await makeCompanyWithUser(prisma, {
      country: "TR",
      tier: "BRONZ",
    });

    const rows = (await service.sellerTenders(bronz.auth)) as {
      id: string;
      masked: boolean;
      canBid: boolean;
    }[];
    const row = rows.find((r) => r.id === listing.id);
    expect(row!.masked).toBe(false);
    expect(row!.canBid).toBe(true);

    const detail = (await service.getOne(bronz.auth, listing.id)) as {
      masked: boolean;
      canBid: boolean;
    };
    expect(detail.masked).toBe(false);
    expect(detail.canBid).toBe(true);
    await expect(
      service.placeBid(bronz.auth, listing.id, bid(item.id)),
    ).resolves.toBeDefined();
  });

  it("süresi DOLMUŞ BRONZ efektif STANDART gibi maskelenir (INV-TIER-1 lazy)", async () => {
    const { service } = makeService();
    const { listing } = await publicListing();
    const expired = await makeCompanyWithUser(prisma, {
      country: "TR",
      tier: "BRONZ",
    });
    await prisma.company.update({
      where: { id: expired.company.id },
      data: { membershipEndAt: new Date(Date.now() - 1000) },
    });
    // JWT strategy efektif tier yazar — testte auth objesini efektifle kur.
    const auth = { ...(expired.auth as object), tier: "STANDART" } as never;
    const detail = (await service.getOne(auth, listing.id)) as {
      masked: boolean;
      canBid: boolean;
    };
    expect(detail.masked).toBe(true);
    expect(detail.canBid).toBe(false);
  });
});
