/**
 * "AI ile daha fazla tedarikçiye eriş" — Faz A dizin keşfi sözleşmesi:
 * kategori eşleşmesi (segment + alt), SILVER+ görünürlük, bağlantılı/bloklu/
 * kendisi hariç, PENDING etiketi, güçlü-eşleşme sıralaması.
 */
import { SupplierDiscoveryService } from "../../src/modules/ai/supplier-discovery/supplier-discovery.service";
import type { PrismaService } from "../../src/common/prisma/prisma.service";
import { prisma, truncateAll } from "./test-db";
import { invite, makeCompany, makeCompanyWithUser, makeListing } from "./factories";
import { foldSearchText } from "@rothern/shared";
import { FREE_PERIOD } from "../../src/common/company/effective-tier";

/**
 * ÜCRETSİZ DÖNEM (2026-10-07): SINIRLI firma = DOĞRULANMAMIŞ firma (saklı
 * kademesi STANDART). Doğrulanmış firma saklı kademesinden bağımsız en üst
 * kademededir → AI önerisine girer.
 */
const LIMITED = { tier: "STANDART", companyVerificationStatus: "UNVERIFIED" } as const;

const svc = () => new SupplierDiscoveryService(prisma as unknown as PrismaService);

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

describe("SupplierDiscoveryService.discoverRegistered", () => {
  it("segment/alt eşleşen doğrulanmış firmalar döner; doğrulanmamış (sınırlı), bağlantılı, bloklu ve kendisi dönmez", async () => {
    const buyer = await makeCompanyWithUser(prisma);
    // Alt-kategori (class) eşleşmesi → güçlü. Depolama kuralı: L2-L4 seçimi
    // `sellerSubCategoryIds`e, segmenti `sellerCategoryIds`e (yayın bildirimi
    // eşleştiricisiyle aynı — eskiden keşif alt kodu ana alanda arıyordu).
    const strong = await makeCompanyWithUser(prisma, { name: "Güçlü AŞ", tier: "SILVER" });
    await prisma.company.update({
      where: { id: strong.company.id },
      data: { sellerCategoryIds: ["30000000"], sellerSubCategoryIds: ["30991500"], city: "İstanbul" },
    });
    // Segment eşleşmesi → normal
    const seg = await makeCompanyWithUser(prisma, { name: "Segment AŞ", tier: "SILVER" });
    await prisma.company.update({
      where: { id: seg.company.id },
      data: { sellerCategoryIds: ["30000000"] },
    });
    // Doğrulanmamış (sınırlı) firma — dönmemeli (AI önerisine yalnız doğrulanmış
    // üye girer; profilini yayınlamış doğrulanmamış firma da aday değil).
    const std = await makeCompanyWithUser(prisma, { name: "Paketsiz", ...LIMITED });
    await prisma.company.update({
      where: { id: std.company.id },
      data: { sellerCategoryIds: ["30000000"] },
    });
    // Zaten ACTIVE bağlantılı — dönmemeli
    const conn = await makeCompanyWithUser(prisma, { name: "Bağlı AŞ", tier: "GOLD" });
    await prisma.company.update({
      where: { id: conn.company.id },
      data: { sellerCategoryIds: ["30000000"] },
    });
    await prisma.companyConnection.create({
      data: {
        inviterCompanyId: buyer.company.id,
        inviteeCompanyId: conn.company.id,
        invitedById: buyer.user.id,
        status: "ACTIVE",
        origin: "PREMIUM",
      },
    });
    // Bloklu — dönmemeli
    const blocked = await makeCompanyWithUser(prisma, { name: "Bloklu", tier: "GOLD" });
    await prisma.company.update({
      where: { id: blocked.company.id },
      data: { sellerCategoryIds: ["30000000"] },
    });
    await prisma.companyBlock.create({
      data: { blockerCompanyId: buyer.company.id, blockedCompanyId: blocked.company.id },
    });

    await prisma.category.create({
      data: { id: "30991500", code: "30991500", nameTr: "İskele sistemleri", level: 3, isActive: true, sortOrder: 0 },
    });

    const res = await svc().discoverRegistered(buyer.auth, {
      type: "ALIM",
      categoryIds: ["30991500"],
    });
    const names = res.candidates.map((c) => c.name);
    expect(names).toEqual(["Güçlü AŞ", "Segment AŞ"]); // güçlü önce
    expect(res.candidates[0]!.strongMatch).toBe(true);
    expect(res.candidates[0]!.matchedCategories).toContain("İskele sistemleri");
    expect(res.candidates[0]!.city).toBe("İstanbul");
  });

  it("bizim gönderdiğimiz PENDING istek listede kalır ve etiketlenir", async () => {
    const buyer = await makeCompanyWithUser(prisma);
    const pending = await makeCompanyWithUser(prisma, { name: "Beklemede AŞ", tier: "SILVER" });
    await prisma.company.update({
      where: { id: pending.company.id },
      data: { sellerCategoryIds: ["30000000"] },
    });
    await prisma.companyConnection.create({
      data: {
        inviterCompanyId: buyer.company.id,
        inviteeCompanyId: pending.company.id,
        invitedById: buyer.user.id,
        status: "PENDING",
        origin: "PREMIUM",
      },
    });
    const res = await svc().discoverRegistered(buyer.auth, {
      type: "ALIM",
      categoryIds: ["30991500"],
    });
    expect(res.candidates).toHaveLength(1);
    expect(res.candidates[0]!.connectionStatus).toBe("PENDING");
  });

  it("GÜVENLİK: başka firmanın talep id'si verilirse davetli listesi sızmaz (alreadyInvited hep false)", async () => {
    const owner = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const attacker = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const rival = await makeCompanyWithUser(prisma, { name: "Rakip AŞ", tier: "SILVER" });
    await prisma.company.update({
      where: { id: rival.company.id },
      data: { sellerCategoryIds: ["30000000"] },
    });
    const listing = await makeListing(prisma, { companyId: owner.company.id, createdById: owner.user.id });
    await invite(prisma, listing.id, rival.company.id, owner.user.id);

    // Sahip kendi talebinde davetliyi görür…
    const own = await svc().discoverRegistered(owner.auth, {
      type: "ALIM",
      categoryIds: ["30991500"],
      listingId: listing.id,
    });
    expect(own.candidates.find((c) => c.name === "Rakip AŞ")?.alreadyInvited).toBe(true);

    // …başka firma aynı id ile soramaz.
    const res = await svc().discoverRegistered(attacker.auth, {
      type: "ALIM",
      categoryIds: ["30991500"],
      listingId: listing.id,
    });
    const rivalRow = res.candidates.find((c) => c.name === "Rakip AŞ");
    expect(rivalRow).toBeDefined();
    expect(rivalRow!.alreadyInvited).toBe(false);
  });

  it("vitrinde kalemi SATAN firma kategori beyanı uymasa da önerilir; hangi kalem olduğu işaretlenir (2026-09-27)", async () => {
    const buyer = await makeCompanyWithUser(prisma);
    const seller = await makeCompanyWithUser(prisma, { name: "Cıvata AŞ", tier: "SILVER" });
    await prisma.company.update({
      where: { id: seller.company.id },
      data: { slug: "civata-as", publicEnabled: true, sellerCategoryIds: ["12000000"] },
    });
    await prisma.companyItem.create({
      data: {
        companyId: seller.company.id,
        createdById: seller.user.id,
        name: "M6 Cıvata DIN 933",
        unit: "adet",
        slug: "m6-civata",
        isPublic: true,
        publishedAt: new Date(),
        searchText: foldSearchText("M6 Cıvata DIN 933 bağlantı elemanı"),
      },
    });
    const res = await svc().discoverRegistered(buyer.auth, {
      type: "ALIM",
      itemNames: ["Rulman 6205", "M6 cıvata"],
    });
    expect(res.candidates.map((c) => c.name)).toEqual(["Cıvata AŞ"]);
    expect(res.candidates[0]!.matchedItems).toEqual([2]);
    expect(res.candidates[0]!.strongMatch).toBe(true);
  });

  it("segmentte 60+ daha yeni firma olsa da ESKİ güçlü eşleşme (alt kategori) puanlamaya girer ve başa gelir (derin denetim S015)", async () => {
    const buyer = await makeCompanyWithUser(prisma);
    await makeCompany(prisma, {
      name: "Eski Güçlü AŞ",
      tier: "SILVER",
      sellerCategoryIds: ["30000000"],
      sellerSubCategoryIds: ["30991500"],
      createdAt: new Date(Date.now() - 365 * 24 * 3600 * 1000),
    });
    for (let i = 0; i < 61; i++) {
      await makeCompany(prisma, { name: `Segment ${i}`, tier: "SILVER", sellerCategoryIds: ["30000000"] });
    }
    const res = await svc().discoverRegistered(buyer.auth, { type: "ALIM", categoryIds: ["30991500"] });
    expect(res.candidates[0]!.name).toBe("Eski Güçlü AŞ");
    expect(res.candidates[0]!.strongMatch).toBe(true);
    expect(res.candidates).toHaveLength(12);
  });

  it("talep belirli ülkelere açıksa o ülkelerin dışındaki firma önerilmez", async () => {
    const buyer = await makeCompanyWithUser(prisma);
    const tr = await makeCompanyWithUser(prisma, { name: "TR AŞ", tier: "SILVER" });
    const de = await makeCompanyWithUser(prisma, { name: "DE GmbH", tier: "SILVER", country: "DE" });
    for (const c of [tr, de]) {
      await prisma.company.update({ where: { id: c.company.id }, data: { sellerCategoryIds: ["30000000"] } });
    }
    const all = await svc().discoverRegistered(buyer.auth, { type: "ALIM", categoryIds: ["30991500"] });
    expect(all.candidates.map((c) => c.name).sort()).toEqual(["DE GmbH", "TR AŞ"]);
    const onlyDe = await svc().discoverRegistered(buyer.auth, {
      type: "ALIM",
      categoryIds: ["30991500"],
      targetCountries: ["DE"],
    });
    expect(onlyDe.candidates.map((c) => c.name)).toEqual(["DE GmbH"]);
  });

  /** Üç firmayı aynı kategoriye, vitrini açık kurar. */
  async function threeSellers() {
    const ok = await makeCompanyWithUser(prisma, { name: "Doğrulanmış Silver", tier: "SILVER" });
    const free = await makeCompanyWithUser(prisma, { name: "Ücretsiz Vitrin", tier: "STANDART" });
    const unverified = await makeCompanyWithUser(prisma, {
      name: "Doğrulanmamış Silver",
      tier: "SILVER",
      companyVerificationStatus: "UNVERIFIED",
    });
    const all = [ok, free, unverified];
    for (const status of ["PENDING", "REJECTED"] as const) {
      all.push(
        await makeCompanyWithUser(prisma, {
          name: `Sınırlı ${status}`,
          tier: "STANDART",
          companyVerificationStatus: status,
        }),
      );
    }
    for (const c of all) {
      await prisma.company.update({
        where: { id: c.company.id },
        data: { sellerCategoryIds: ["30000000"], publicEnabled: true, slug: `s-${c.company.id}` },
      });
    }
  }

  it("ücretsiz dönem: AI önerisine YALNIZ doğrulanmış üye girer — saklı kademesi STANDART olan doğrulanmış firma DAHİL; doğrulanmamış / incelemedeki / reddedilmiş firma saklı paketi olsa da önerilmez", async () => {
    const buyer = await makeCompanyWithUser(prisma);
    await threeSellers();
    const res = await svc().discoverRegistered(buyer.auth, { type: "ALIM", categoryIds: ["30991500"] });
    expect(res.candidates.map((c) => c.name).sort()).toEqual(["Doğrulanmış Silver", "Ücretsiz Vitrin"]);
  });

  describe("saklı paket kuralı (ücretsiz dönem anahtarı KAPALI)", () => {
    // Paket kademesi şartı anahtar kapalıyken geçerlidir; açıkken doğrulama tek başına yeter.
    beforeEach(() => {
      jest.replaceProperty(FREE_PERIOD, "VERIFIED_HAS_FULL_ACCESS", false);
    });
    afterEach(() => {
      jest.restoreAllMocks();
    });

    it("AI önerisine YALNIZ SILVER+ ∧ doğrulanmış üye girer: vitrini açık ücretsiz firma ve doğrulanmamış Silver önerilmez (2026-09-28)", async () => {
      const buyer = await makeCompanyWithUser(prisma);
      await threeSellers();
      const res = await svc().discoverRegistered(buyer.auth, { type: "ALIM", categoryIds: ["30991500"] });
      expect(res.candidates.map((c) => c.name)).toEqual(["Doğrulanmış Silver"]);
    });
  });
});
