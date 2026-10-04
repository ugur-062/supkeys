/**
 * Kademe görünürlüğü — STANDART, bağlı/davetli OLMADIĞI PUBLIC talebi TAM
 * görmez (tam listede yok, detay 403 TIER_REQUIRED, teklif 403); onu Açık
 * Talepler'de ALICI GİZLİ maskeli satır olarak görür (`maskedPublicTenders`,
 * 2026-10-03 — eski kilitli sayı kartının yerine; ayrıntılı sözleşme
 * `masked-public-tenders.spec.ts`). Davet/bağlantı → tam görünüm + teklif,
 * maskelenmez. SILVER+ → PUBLIC tam + teklif, maskeli liste boş. Formüllerin
 * tek kaynağı listingBidEligibility (listing-visibility.ts) —
 * getOne/sellerTenders/placeBid aynı kuralı okur.
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

let seq = 0;
async function publicListing() {
  const owner = await makeCompanyWithUser(prisma, { country: "TR" });
  const listing = await makeListing(prisma, {
    companyId: owner.company.id,
    createdById: owner.user.id,
    type: "ALIM",
    status: "OPEN",
    visibility: "PUBLIC",
    closesAt: FUTURE,
    // Maskeli satır numarayla açılır; numarasız kayıt maskeli listeye girmez.
    number: `ROT-${String(600000 + ++seq)}`,
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

describe("Kademe görünürlüğü — STANDART PUBLIC'i yalnız maskeli görür, davet/bağlantı açar", () => {
  it("STANDART: bağsız PUBLIC tam listede YOK; detay 403 TIER_REQUIRED; maskeli satırda alıcı gizli", async () => {
    const { service } = makeService();
    const { listing } = await publicListing();
    const std = await makeCompanyWithUser(prisma, {
      country: "TR",
      tier: "STANDART",
    });

    const rows = (await service.sellerTenders(std.auth)) as { id: string }[];
    expect(rows.find((r) => r.id === listing.id)).toBeUndefined();

    const err = await service.getOne(std.auth, listing.id).then(
      () => null,
      (e: unknown) => e as { getStatus(): number; getResponse(): unknown },
    );
    expect(err).not.toBeNull();
    expect(err!.getStatus()).toBe(403);
    expect(err!.getResponse()).toMatchObject({ code: "TIER_REQUIRED", minTier: "SILVER" });

    const masked = await service.maskedPublicTenders(std.auth);
    expect(masked).toHaveLength(1);
    expect(masked[0]?.title).toBe(listing.title);
    expect(masked[0]).not.toHaveProperty("id");
    expect(masked[0]).not.toHaveProperty("owner");
    expect(JSON.stringify(masked)).not.toContain(listing.id);
    // Pano keşif sayaçları TAM listeyle aynı kapıyı okur: ücretsize 0
    // (maskeli satırlar sektör süzgecine web'de, kendi listesinden girer).
    expect((await service.discoverFacets(std.auth)).total).toBe(0);
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

  it("STANDART davet edilince TAM görür + teklif verir; maskelenmez", async () => {
    const { service } = makeService();
    const { owner, listing, item } = await publicListing();
    const std = await makeCompanyWithUser(prisma, {
      country: "TR",
      tier: "STANDART",
    });
    await invite(prisma, listing.id, std.company.id, owner.user.id);

    const rows = (await service.sellerTenders(std.auth)) as { id: string; canBid: boolean; owner: unknown }[];
    const row = rows.find((r) => r.id === listing.id);
    expect(row?.canBid).toBe(true);
    expect(row?.owner).toBeTruthy();
    const detail = (await service.getOne(std.auth, listing.id)) as {
      canBid: boolean;
      owner: { name: string } | null;
      description: unknown;
    };
    expect(detail.canBid).toBe(true);
    expect(detail.owner?.name).toBeTruthy();
    await expect(
      service.placeBid(std.auth, listing.id, bid(item.id)),
    ).resolves.toBeDefined();
    expect(await service.maskedPublicTenders(std.auth)).toEqual([]);
  });

  it("STANDART bağlantısının talebini TAM görür + teklif verir", async () => {
    const { service } = makeService();
    const { owner, listing, item } = await publicListing();
    const std = await makeCompanyWithUser(prisma, {
      country: "TR",
      tier: "STANDART",
    });
    await connect(prisma, owner.company.id, std.company.id, owner.user.id);

    const detail = (await service.getOne(std.auth, listing.id)) as { canBid: boolean };
    expect(detail.canBid).toBe(true);
    await expect(
      service.placeBid(std.auth, listing.id, bid(item.id)),
    ).resolves.toBeDefined();
    expect(await service.maskedPublicTenders(std.auth)).toEqual([]);
  });

  it("hasBid istisnası: teklif vermiş STANDART firma bağlantı düşse de kendi talebini görür, maskelenmez", async () => {
    const { service } = makeService();
    const { owner, listing, item } = await publicListing();
    const std = await makeCompanyWithUser(prisma, { country: "TR", tier: "STANDART" });
    await connect(prisma, owner.company.id, std.company.id, owner.user.id);
    await expect(service.placeBid(std.auth, listing.id, bid(item.id))).resolves.toBeDefined();
    // Bağlantı düştü (kuran taraf paketsiz kaldı / silindi).
    await prisma.companyConnection.deleteMany({ where: { inviteeCompanyId: std.company.id } });
    await prisma.companyConnection.deleteMany({ where: { inviterCompanyId: std.company.id } });

    const detail = (await service.getOne(std.auth, listing.id)) as { canBid: boolean; myBid: unknown };
    expect(detail.myBid).toBeTruthy();
    expect(detail.canBid).toBe(false); // görür ama yeniden teklif kapısı paketli
    const rows = (await service.sellerTenders(std.auth)) as { id: string }[];
    expect(rows.find((r) => r.id === listing.id)).toBeTruthy();
    expect(await service.maskedPublicTenders(std.auth)).toEqual([]);
  });

  it("SILVER aynı PUBLIC'i görür + teklif verir; maskeli liste boş", async () => {
    const { service } = makeService();
    const { listing, item } = await publicListing();
    const silver = await makeCompanyWithUser(prisma, {
      country: "TR",
      tier: "SILVER",
    });

    const rows = (await service.sellerTenders(silver.auth)) as { id: string; canBid: boolean }[];
    const row = rows.find((r) => r.id === listing.id);
    expect(row?.canBid).toBe(true);
    const detail = (await service.getOne(silver.auth, listing.id)) as { canBid: boolean };
    expect(detail.canBid).toBe(true);
    await expect(
      service.placeBid(silver.auth, listing.id, bid(item.id)),
    ).resolves.toBeDefined();
    expect(await service.maskedPublicTenders(silver.auth)).toEqual([]);
  });

  it("süresi DOLMUŞ SILVER efektif STANDART gibi görmez (INV-TIER-1 lazy)", async () => {
    const { service } = makeService();
    const { listing } = await publicListing();
    const expired = await makeCompanyWithUser(prisma, {
      country: "TR",
      tier: "SILVER",
    });
    await prisma.company.update({
      where: { id: expired.company.id },
      data: { membershipEndAt: new Date(Date.now() - 1000) },
    });
    // JWT strategy efektif tier yazar — testte auth objesini efektifle kur.
    const auth = { ...(expired.auth as object), tier: "STANDART" } as never;
    await expect(service.getOne(auth, listing.id)).rejects.toMatchObject({ status: 403 });
  });
});

describe("Faz T — Gold Üye rozeti + akış-kurma SILVER kapısı", () => {
  it("SEO public profil: yalnız GOLD'da goldMember:true", async () => {
    const { PublicProfileService } = await import(
      "../../src/modules/public-profile/public-profile.service"
    );
    // Eski imzadan kalan depolama stub'ı KALDIRILDI (2026-09-23): ikinci parametre
    // artık isteğe bağlı ContentTranslationService — stub oraya düşüp
    // "localizeCompanies is not a function" veriyordu (rig-stub tuzağı).
    const svc = new PublicProfileService(prisma as never);
    const gold = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    await prisma.company.update({
      where: { id: gold.company.id },
      data: { publicEnabled: true, slug: `gold-${Date.now()}` },
    });
    const g = await prisma.company.findUniqueOrThrow({
      where: { id: gold.company.id },
    });
    const pub = (await svc.getBySlug(g.slug!)) as { goldMember: boolean };
    expect(pub.goldMember).toBe(true);

    const silver = await makeCompanyWithUser(prisma, { tier: "SILVER" });
    await prisma.company.update({
      where: { id: silver.company.id },
      data: { publicEnabled: true, slug: `silver-${Date.now()}` },
    });
    const s = await prisma.company.findUniqueOrThrow({
      where: { id: silver.company.id },
    });
    const pub2 = (await svc.getBySlug(s.slug!)) as { goldMember: boolean };
    expect(pub2.goldMember).toBe(false);
  });

  it("akış-KURMA uçları CompanyPaidTierGuard (Silver+) taşır; yönetme/karar uçları taşımaz", async () => {
    const { CompanyApprovalsController } = await import(
      "../../src/modules/company-approvals/company-approvals.controller"
    );
    const { CompanyPaidTierGuard } = await import(
      "../../src/modules/company-auth/guards/company-paid-tier.guard"
    );
    const guardsOf = (m: string) =>
      (Reflect.getMetadata(
        "__guards__",
        CompanyApprovalsController.prototype[
          m as keyof typeof CompanyApprovalsController.prototype
        ] as object,
      ) ?? []) as unknown[];
    expect(guardsOf("createFlow")).toContain(CompanyPaidTierGuard);
    expect(guardsOf("duplicateFlow")).toContain(CompanyPaidTierGuard);
    // Açık işlemler tamamlanabilir: mevcut akış yönetimi + karar tier'sız.
    for (const m of ["updateFlow", "setStatus", "deleteFlow", "approve"]) {
      expect(guardsOf(m)).not.toContain(CompanyPaidTierGuard);
    }
  });
});
