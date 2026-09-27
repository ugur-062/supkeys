/**
 * "AI ile daha fazla tedarikçiye eriş" — Faz A dizin keşfi sözleşmesi:
 * kategori eşleşmesi (segment + alt), SILVER+ görünürlük, bağlantılı/bloklu/
 * kendisi hariç, PENDING etiketi, güçlü-eşleşme sıralaması.
 */
import { SupplierDiscoveryService } from "../../src/modules/ai/supplier-discovery/supplier-discovery.service";
import type { PrismaService } from "../../src/common/prisma/prisma.service";
import { prisma, truncateAll } from "./test-db";
import { makeCompanyWithUser } from "./factories";
import { foldSearchText } from "@rothern/shared";

const svc = () => new SupplierDiscoveryService(prisma as unknown as PrismaService);

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

describe("SupplierDiscoveryService.discoverRegistered", () => {
  it("segment/alt eşleşen SILVER+ firmalar döner; profilsiz STANDART, bağlantılı, bloklu ve kendisi dönmez", async () => {
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
    // STANDART ve profilini YAYINLAMAMIŞ (dizinde görünmez) — dönmemeli.
    // (Profilini yayınlamış ücretsiz firma 2026-09-06'dan beri ADAY — aşağıdaki test.)
    const std = await makeCompanyWithUser(prisma, { name: "Paketsiz", tier: "STANDART" });
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
});
