/**
 * Kademe görünürlüğü — STANDART, bağlı/davetli OLMADIĞI PUBLIC talebi TAM
 * görmez (tam listede yok, detay 403 TIER_REQUIRED, teklif 403); onu Açık
 * Talepler'de ALICI GİZLİ maskeli satır olarak görür (`maskedPublicTenders`,
 * 2026-10-03 — eski kilitli sayı kartının yerine; ayrıntılı sözleşme
 * `masked-public-tenders.spec.ts`). Davet/bağlantı → tam görünüm + teklif,
 * maskelenmez. SILVER+ → PUBLIC tam + teklif, maskeli liste boş. Formüllerin
 * tek kaynağı listingBidEligibility (listing-visibility.ts) —
 * getOne/sellerTenders/placeBid aynı kuralı okur.
 *
 * ÜCRETSİZ DÖNEM (2026-10-07): SINIRLI ("STANDART") firma = DOĞRULANMAMIŞ
 * firma (saklı kademesi STANDART). Doğrulanmış firma saklı kademesinden
 * bağımsız tam erişimlidir (JWT efektif kademe GOLD taşır). Ret metni paket
 * değil doğrulama ister.
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
import { FREE_PERIOD } from "../../src/common/company/effective-tier";

const LIMITED = { tier: "STANDART", companyVerificationStatus: "UNVERIFIED" } as const;
const PACKAGE_WORDS = /silver|gold|paket|premium|üyelik/i;

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
    // Maskeli küme vitrin kapısıyla kesişir (yayımlanmış olmalı).
    publishedAt: new Date(),
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
    const std = await makeCompanyWithUser(prisma, { country: "TR", ...LIMITED });

    const rows = (await service.sellerTenders(std.auth)) as { id: string }[];
    expect(rows.find((r) => r.id === listing.id)).toBeUndefined();

    const err = await service.getOne(std.auth, listing.id).then(
      () => null,
      (e: unknown) => e as { getStatus(): number; getResponse(): unknown },
    );
    expect(err).not.toBeNull();
    expect(err!.getStatus()).toBe(403);
    expect(err!.getResponse()).toMatchObject({
      code: "TIER_REQUIRED",
      minTier: "SILVER",
      verificationStatus: "UNVERIFIED",
      verifyPath: "/company/ayarlar/dogrulama",
    });
    const denial = String((err!.getResponse() as { message: unknown }).message);
    expect(denial).toMatch(/doğrula/i);
    expect(denial).not.toMatch(PACKAGE_WORDS);

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
    const std = await makeCompanyWithUser(prisma, { country: "TR", ...LIMITED });
    const err = await service.placeBid(std.auth, listing.id, bid(item.id)).catch((e: Error) => e);
    expect(err).toMatchObject({ status: 403 });
    expect((err as Error).message).toMatch(/doğrula/i);
    expect((err as Error).message).not.toMatch(PACKAGE_WORDS);
    expect(await prisma.listingBid.count({ where: { listingId: listing.id } })).toBe(0);
    // İncelemedeki / reddedilmiş firma da teklif veremez; durumuna özel metni alır.
    for (const [status, pattern] of [
      ["PENDING", /inceleniyor/i],
      ["REJECTED", /yeniden başvurun/i],
    ] as const) {
      const co = await makeCompanyWithUser(prisma, {
        country: "TR",
        tier: "STANDART",
        companyVerificationStatus: status,
      });
      const e = await service.placeBid(co.auth, listing.id, bid(item.id)).catch((x: Error) => x);
      expect(e).toMatchObject({ status: 403 });
      expect((e as Error).message).toMatch(pattern);
      expect((e as Error).message).not.toMatch(PACKAGE_WORDS);
    }
  });

  it("STANDART davet edilince TAM görür + teklif verir; maskelenmez", async () => {
    const { service } = makeService();
    const { owner, listing, item } = await publicListing();
    const std = await makeCompanyWithUser(prisma, { country: "TR", ...LIMITED });
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
    const std = await makeCompanyWithUser(prisma, { country: "TR", ...LIMITED });
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
    const std = await makeCompanyWithUser(prisma, { country: "TR", ...LIMITED });
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

  it("doğrulanmış firma (saklı STANDART) aynı PUBLIC'i görür + teklif verir; maskeli liste boş", async () => {
    const { service } = makeService();
    const { listing, item } = await publicListing();
    const verified = await makeCompanyWithUser(prisma, { country: "TR", tier: "STANDART" });
    // JWT strategy efektif kademe yazar: doğrulanmış firma ücretsiz dönemde GOLD.
    const auth = { ...verified.auth, tier: "GOLD" } as typeof verified.auth;

    const rows = (await service.sellerTenders(auth)) as { id: string; canBid: boolean }[];
    const row = rows.find((r) => r.id === listing.id);
    expect(row?.canBid).toBe(true);
    const detail = (await service.getOne(auth, listing.id)) as { canBid: boolean };
    expect(detail.canBid).toBe(true);
    await expect(service.placeBid(auth, listing.id, bid(item.id))).resolves.toBeDefined();
    expect(await service.maskedPublicTenders(auth)).toEqual([]);
  });

  it("doğrulanmamış ama süresi dolmamış saklı SILVER firma görünürlüğünü korur (kimse erişim yitirmez)", async () => {
    const { service } = makeService();
    const { listing, item } = await publicListing();
    const silver = await makeCompanyWithUser(prisma, {
      country: "TR",
      tier: "SILVER",
      companyVerificationStatus: "UNVERIFIED",
    });

    const rows = (await service.sellerTenders(silver.auth)) as { id: string; canBid: boolean }[];
    const row = rows.find((r) => r.id === listing.id);
    expect(row?.canBid).toBe(true);
    const detail = (await service.getOne(silver.auth, listing.id)) as { canBid: boolean };
    expect(detail.canBid).toBe(true);
    expect(await service.maskedPublicTenders(silver.auth)).toEqual([]);
    // Görünürlük kademe kapısıdır (korunur). Teklif GÖNDERİMİ ayrıca INV-KYC-1'e
    // tabidir: davetsiz ∧ bağlantısız teklifçi doğrulanmış olmalı — bu ret kademe
    // değil KYC kuralıdır ve kademeden bağımsız hep vardı.
    const kyc = await service.placeBid(silver.auth, listing.id, bid(item.id)).catch((e: Error) => e);
    expect(kyc).toMatchObject({ status: 403 });
    expect((kyc as Error).message).toMatch(/doğrulamanız tamamlanmadan teklif veremezsiniz/i);
    expect((kyc as Error).message).not.toMatch(PACKAGE_WORDS);
  });

  it("süresi DOLMUŞ saklı SILVER (doğrulanmamış) efektif STANDART gibi görmez (INV-TIER-1 lazy)", async () => {
    const { service } = makeService();
    const { listing } = await publicListing();
    const expired = await makeCompanyWithUser(prisma, {
      country: "TR",
      tier: "SILVER",
      companyVerificationStatus: "UNVERIFIED",
    });
    await prisma.company.update({
      where: { id: expired.company.id },
      data: { membershipEndAt: new Date(Date.now() - 1000) },
    });
    // JWT strategy efektif tier yazar — testte auth objesini efektifle kur.
    const auth = { ...(expired.auth as object), tier: "STANDART" } as never;
    await expect(service.getOne(auth, listing.id)).rejects.toMatchObject({ status: 403 });
  });

  describe("saklı paket makinesi (ücretsiz dönem anahtarı KAPALI)", () => {
    // Ücretli kademe ayrımı uykuda; anahtar kapanınca doğrulanmış firma da saklı kademesine döner.
    beforeEach(() => {
      jest.replaceProperty(FREE_PERIOD, "VERIFIED_HAS_FULL_ACCESS", false);
    });
    afterEach(() => {
      jest.restoreAllMocks();
    });

    it("doğrulanmış STANDART bağsız PUBLIC'i göremez/teklif veremez; doğrulanmış SILVER görür + teklif verir", async () => {
      const { service } = makeService();
      const { listing, item } = await publicListing();
      const std = await makeCompanyWithUser(prisma, { country: "TR", tier: "STANDART" });
      await expect(service.getOne(std.auth, listing.id)).rejects.toMatchObject({
        status: 403,
        response: { code: "TIER_REQUIRED", minTier: "SILVER" },
      });
      await expect(service.placeBid(std.auth, listing.id, bid(item.id))).rejects.toMatchObject({ status: 403 });
      expect(await service.maskedPublicTenders(std.auth)).toHaveLength(1);

      const silver = await makeCompanyWithUser(prisma, { country: "TR", tier: "SILVER" });
      const detail = (await service.getOne(silver.auth, listing.id)) as { canBid: boolean };
      expect(detail.canBid).toBe(true);
      await expect(service.placeBid(silver.auth, listing.id, bid(item.id))).resolves.toBeDefined();
      expect(await service.maskedPublicTenders(silver.auth)).toEqual([]);
    });

    it("süresi DOLMUŞ SILVER (doğrulanmış) efektif STANDART gibi görmez", async () => {
      const { service } = makeService();
      const { listing } = await publicListing();
      const expired = await makeCompanyWithUser(prisma, { country: "TR", tier: "SILVER" });
      await prisma.company.update({
        where: { id: expired.company.id },
        data: { membershipEndAt: new Date(Date.now() - 1000) },
      });
      const auth = { ...(expired.auth as object), tier: "STANDART" } as never;
      await expect(service.getOne(auth, listing.id)).rejects.toMatchObject({ status: 403 });
    });
  });
});

describe("Faz T — Gold Üye rozeti + akış-kurma SILVER kapısı", () => {
  async function goldMemberOf(opts: Parameters<typeof makeCompanyWithUser>[1], tag: string) {
    const { PublicProfileService } = await import(
      "../../src/modules/public-profile/public-profile.service"
    );
    // Eski imzadan kalan depolama stub'ı KALDIRILDI (2026-09-23): ikinci parametre
    // artık isteğe bağlı ContentTranslationService — stub oraya düşüp
    // "localizeCompanies is not a function" veriyordu (rig-stub tuzağı).
    const svc = new PublicProfileService(prisma as never);
    const co = await makeCompanyWithUser(prisma, opts);
    const slug = `${tag}-${Date.now()}`;
    await prisma.company.update({
      where: { id: co.company.id },
      data: { publicEnabled: true, slug },
    });
    return ((await svc.getBySlug(slug)) as { goldMember: boolean }).goldMember;
  }

  it("SEO public profil: goldMember yalnız EFEKTİF GOLD'da true (ücretsiz dönem: doğrulanmış her firma)", async () => {
    expect(await goldMemberOf({ tier: "GOLD" }, "gold")).toBe(true);
    // Doğrulanmış firma saklı kademesi ne olursa olsun efektif GOLD.
    expect(await goldMemberOf({ tier: "SILVER" }, "silver-v")).toBe(true);
    expect(await goldMemberOf({ tier: "STANDART" }, "std-v")).toBe(true);
    // Doğrulanmamış firma saklı kademesiyle kalır.
    expect(await goldMemberOf({ tier: "SILVER", companyVerificationStatus: "UNVERIFIED" }, "silver-u")).toBe(false);
    expect(await goldMemberOf({ ...LIMITED }, "std-u")).toBe(false);
    expect(await goldMemberOf({ tier: "GOLD", companyVerificationStatus: "PENDING" }, "gold-p")).toBe(true);
  });

  describe("saklı kademe (ücretsiz dönem anahtarı KAPALI)", () => {
    // Rozetin saklı GOLD/SILVER ayrımı uykuda; anahtar kapanınca geri gelmeli.
    beforeEach(() => {
      jest.replaceProperty(FREE_PERIOD, "VERIFIED_HAS_FULL_ACCESS", false);
    });
    afterEach(() => {
      jest.restoreAllMocks();
    });

    it("SEO public profil: yalnız GOLD'da goldMember:true", async () => {
      expect(await goldMemberOf({ tier: "GOLD" }, "gold-off")).toBe(true);
      expect(await goldMemberOf({ tier: "SILVER" }, "silver-off")).toBe(false);
    });
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
