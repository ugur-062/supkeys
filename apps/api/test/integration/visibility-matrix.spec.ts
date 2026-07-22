/**
 * Görünürlük/yetki matrisi — kullanıcının işaret ettiği eksikler:
 *  1) getOne görüntüleme+maskeleme (PUBLIC premium/STANDARD/bağlı, CONNECTIONS
 *     bağlı-olmayan premium DAHİL 404, PRIVATE davetli/davetsiz).
 *  2) İngiliz Usulü BEST_AND_OWN_RANK modu (hem en iyi hem kendi sıra).
 *  3) buyNow yetki matrisi (bağlantı/premium/rol).
 */
import { CompanyRole } from "@rothern/db";
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

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

async function listing(visibility: "PUBLIC" | "CONNECTIONS" | "PRIVATE") {
  const { service } = makeService();
  const owner = await makeCompanyWithUser(prisma, { country: "TR" });
  const l = await makeListing(prisma, {
    companyId: owner.company.id,
    createdById: owner.user.id,
    type: "ALIM",
    status: "OPEN",
    visibility,
    closesAt: FUTURE,
    // BK-B: serbest-metin ödeme notu — maskeli teaser'da gizlenmeli.
    paymentNote: "Ödeme: IBAN TR00 ... 0000, muhasebe@firma.com",
  });
  await makeItem(prisma, l.id);
  return { service, owner, l };
}

describe("getOne — görüntüleme & maskeleme matrisi", () => {
  it("PUBLIC + premium (PAKET) bağlı-değil → görür, maskesiz, teklif verebilir", async () => {
    const { service, l } = await listing("PUBLIC");
    const v = await makeCompanyWithUser(prisma, { country: "TR", tier: "GOLD" });
    const res = (await service.getOne(v.auth, l.id)) as {
      masked: boolean;
      canBid: boolean;
      items: unknown[];
      paymentNote: unknown;
    };
    expect(res.masked).toBe(false);
    expect(res.canBid).toBe(true);
    expect(res.items.length).toBe(1);
    // Maskesiz izleyici ödeme notunu görür.
    expect(res.paymentNote).toBe("Ödeme: IBAN TR00 ... 0000, muhasebe@firma.com");
  });

  it("PUBLIC + STANDARD bağlı-değil → görür ama MASKELİ (kalem teaser, teklif veremez)", async () => {
    const { service, l } = await listing("PUBLIC");
    const v = await makeCompanyWithUser(prisma, {
      country: "TR",
      tier: "STANDART",
    });
    const res = (await service.getOne(v.auth, l.id)) as {
      masked: boolean;
      canBid: boolean;
      items: { targetPrice: unknown }[];
      paymentNote: unknown;
    };
    expect(res.masked).toBe(true);
    expect(res.canBid).toBe(false);
    // Teaser: kalem görünür (ne alınıyor belli) ama fiyat gizli.
    expect(res.items.length).toBe(1);
    expect(res.items[0].targetPrice).toBeNull();
    // BK-B: serbest-metin ödeme notu maskede sızmaz.
    expect(res.paymentNote).toBeNull();
  });

  it("PUBLIC + STANDARD ama BAĞLI → maskesiz", async () => {
    const { service, owner, l } = await listing("PUBLIC");
    const v = await makeCompanyWithUser(prisma, {
      country: "TR",
      tier: "STANDART",
    });
    await connect(prisma, owner.company.id, v.company.id, owner.user.id);
    const res = (await service.getOne(v.auth, l.id)) as { masked: boolean };
    expect(res.masked).toBe(false);
  });

  it("CONNECTIONS + PREMIUM ama bağlı-değil → GÖRMEMELİ (404)", async () => {
    const { service, l } = await listing("CONNECTIONS");
    const v = await makeCompanyWithUser(prisma, { country: "TR", tier: "GOLD" });
    await expect(service.getOne(v.auth, l.id)).rejects.toThrow();
  });

  it("CONNECTIONS + bağlı → görür", async () => {
    const { service, owner, l } = await listing("CONNECTIONS");
    const v = await makeCompanyWithUser(prisma, { country: "TR" });
    await connect(prisma, owner.company.id, v.company.id, owner.user.id);
    await expect(service.getOne(v.auth, l.id)).resolves.toBeDefined();
  });

  it("PRIVATE + davetsiz → 404; davetli → görür", async () => {
    const { service, owner, l } = await listing("PRIVATE");
    const outsider = await makeCompanyWithUser(prisma, { country: "TR" });
    await expect(service.getOne(outsider.auth, l.id)).rejects.toThrow();

    const guest = await makeCompanyWithUser(prisma, { country: "TR" });
    await invite(prisma, l.id, guest.company.id, owner.user.id);
    await expect(service.getOne(guest.auth, l.id)).resolves.toBeDefined();
  });
});

describe("İngiliz Usulü — BEST_AND_OWN_RANK", () => {
  it("hem en iyi tutar hem kendi sıra görünür, liste gizli", async () => {
    const { service } = makeService();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const viewer = await makeCompanyWithUser(prisma, {
      country: "TR",
      tier: "GOLD",
    });
    const rival = await makeCompanyWithUser(prisma, { country: "TR" });
    const l = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      status: "OPEN",
      visibility: "PUBLIC",
      format: "ENGLISH_AUCTION",
      bidVisibility: "BEST_AND_OWN_RANK",
      closesAt: FUTURE,
    });
    await makeBid(prisma, {
      listingId: l.id,
      bidderCompanyId: rival.company.id,
      createdById: rival.user.id,
      amount: 800,
    });
    await makeBid(prisma, {
      listingId: l.id,
      bidderCompanyId: viewer.company.id,
      createdById: viewer.user.id,
      amount: 1000,
    });
    const res = (await service.getOne(viewer.auth, l.id)) as {
      auctionView: {
        bestTotal: string | null;
        myRank: number | null;
        allBids: unknown;
      };
    };
    expect(res.auctionView.bestTotal).toBe("800");
    expect(res.auctionView.myRank).toBe(2);
    expect(res.auctionView.allBids).toBeNull();
  });
});

describe("buyNow — yetki matrisi", () => {
  async function satis(visibility: "PUBLIC" | "CONNECTIONS") {
    const { service } = makeService();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const l = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "SATIS",
      status: "OPEN",
      visibility,
      buyNowPrice: "5000",
      closesAt: FUTURE,
    });
    return { service, owner, l };
  }

  it("CONNECTIONS + bağlı-değil → görünmez (reddedilir)", async () => {
    const { service, l } = await satis("CONNECTIONS");
    const v = await makeCompanyWithUser(prisma, { country: "TR", tier: "GOLD" });
    await expect(service.buyNow(v.auth, l.id)).rejects.toThrow();
  });

  it("PUBLIC + STANDARD bağlı-değil → premium gerekir (reddedilir)", async () => {
    const { service, l } = await satis("PUBLIC");
    const v = await makeCompanyWithUser(prisma, {
      country: "TR",
      tier: "STANDART",
    });
    await expect(service.buyNow(v.auth, l.id)).rejects.toThrow(/premium/i);
  });

  it("PUBLIC + STANDARD ama BAĞLI → izin verilir", async () => {
    const { service, owner, l } = await satis("PUBLIC");
    const v = await makeCompanyWithUser(prisma, {
      country: "TR",
      tier: "STANDART",
    });
    await connect(prisma, owner.company.id, v.company.id, owner.user.id);
    await expect(
      service.buyNow(v.auth, l.id, {
        deliveryDate: new Date(Date.now() + 7 * 86_400_000).toISOString(),
        validityDays: 30,
      }),
    ).resolves.toBeDefined();
  });

  it("yanlış rol (Satın Almacı değil) → reddedilir", async () => {
    const { service, l } = await satis("PUBLIC");
    const v = await makeCompanyWithUser(prisma, {
      country: "TR",
      tier: "GOLD",
      roles: [CompanyRole.SATISCI],
    });
    await expect(service.buyNow(v.auth, l.id)).rejects.toThrow(/rol/i);
  });
});
