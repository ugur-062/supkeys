/**
 * "AI ile daha fazla tedarikçiye eriş" — Faz A dizin keşfi sözleşmesi:
 * kategori eşleşmesi (segment + alt), BRONZ+ görünürlük, bağlantılı/bloklu/
 * kendisi hariç, PENDING etiketi, güçlü-eşleşme sıralaması.
 */
import { SupplierDiscoveryService } from "../../src/modules/ai/supplier-discovery/supplier-discovery.service";
import type { PrismaService } from "../../src/common/prisma/prisma.service";
import { prisma, truncateAll } from "./test-db";
import { makeCompanyWithUser } from "./factories";

const svc = () => new SupplierDiscoveryService(prisma as unknown as PrismaService);

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

describe("SupplierDiscoveryService.discoverRegistered", () => {
  it("segment/alt eşleşen BRONZ+ firmalar döner; STANDART, bağlantılı, bloklu ve kendisi dönmez", async () => {
    const buyer = await makeCompanyWithUser(prisma);
    // Alt-kategori (class) eşleşmesi → güçlü
    const strong = await makeCompanyWithUser(prisma, { name: "Güçlü AŞ", tier: "BRONZ" });
    await prisma.company.update({
      where: { id: strong.company.id },
      data: { sellerCategoryIds: ["30991500"], city: "İstanbul" },
    });
    // Segment eşleşmesi → normal
    const seg = await makeCompanyWithUser(prisma, { name: "Segment AŞ", tier: "SILVER" });
    await prisma.company.update({
      where: { id: seg.company.id },
      data: { sellerCategoryIds: ["30000000"] },
    });
    // STANDART (dizinde görünmez) — dönmemeli
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
    const pending = await makeCompanyWithUser(prisma, { name: "Beklemede AŞ", tier: "BRONZ" });
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

  it("SATIS ihalesi alıcı adaylarını (buyerCategoryIds) arar", async () => {
    const seller = await makeCompanyWithUser(prisma);
    const buyerCo = await makeCompanyWithUser(prisma, { name: "Alıcı AŞ", tier: "SILVER" });
    await prisma.company.update({
      where: { id: buyerCo.company.id },
      data: { buyerCategoryIds: ["30000000"], sellerCategoryIds: [] },
    });
    const res = await svc().discoverRegistered(seller.auth, {
      type: "SATIS",
      categoryIds: ["30991500"],
    });
    expect(res.candidates.map((c) => c.name)).toEqual(["Alıcı AŞ"]);
  });
});
