/**
 * ÜCRETSİZ (STANDART) VİTRİN — 2026-09-06 kullanıcı kararı "premium çekmek için".
 *
 * Görünmek ücretsiz, öne çıkmak paketli:
 *  - Standart firma profilini yayınlar, ürün vitrini açar, dizinde listelenir.
 *  - Paketin karşılığı: dizin/ürün sıralamasında öncelik, sınırsız ürün
 *    (`PRODUCT_LIMITS`), belge/video (`PRODUCT_MEDIA_TIER`).
 */
import { ForbiddenException } from "@nestjs/common";
import { PRODUCT_LIMITS } from "@rothern/shared";
import { buildDirectory } from "../../src/common/company/company-directory";
import { CompanyItemsController } from "../../src/modules/company-items/company-items.controller";
import { CompanyItemsService } from "../../src/modules/company-items/company-items.service";
import { CompanyPaidTierGuard } from "../../src/modules/company-auth/guards/company-paid-tier.guard";
import { PublicProfileService } from "../../src/modules/public-profile/public-profile.service";
import type { PrismaBypassService } from "../../src/common/prisma/prisma.service";
import { makeCompanyWithUser } from "./factories";
import { prisma, truncateAll } from "./test-db";

const items = () =>
  new CompanyItemsService(prisma as never, { log: jest.fn() } as never, {} as never);

let seq = 0;
/** Yayın kapısını geçen (ad/kategori/açıklama/görsel/anahtar kelime) TASLAK ürün. */
async function draftProduct(companyId: string, userId: string, over: Record<string, unknown> = {}) {
  seq += 1;
  return prisma.companyItem.create({
    data: {
      companyId,
      createdById: userId,
      name: `Ürün ${seq}`,
      unit: "adet",
      categoryId: "39121000",
      description: "y".repeat(120),
      images: ["a.webp"],
      keywords: ["pano"],
      isPublic: false,
      ...over,
    },
  });
}

async function listedCompany(
  tier: "STANDART" | "SILVER" | "GOLD",
  slug: string,
  companyVerificationStatus: "UNVERIFIED" | "VERIFIED" = "VERIFIED",
) {
  const made = await makeCompanyWithUser(prisma, { tier, companyVerificationStatus });
  await prisma.company.update({
    where: { id: made.company.id },
    data: { publicEnabled: true, slug, city: "İzmir" },
  });
  await draftProduct(made.company.id, made.user.id, {
    isPublic: true,
    publishedAt: new Date(),
    slug: `${slug}-urun`,
  });
  return made;
}

describe("ücretsiz vitrin — ürün tavanı ve medya", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("STANDART: yayında ürün tavanı 10 — 11. yayın 403, taslak sınırsız; SILVER limitsiz", async () => {
    const limit = PRODUCT_LIMITS.STANDART as number;
    expect(limit).toBe(10);
    const std = await makeCompanyWithUser(prisma, { tier: "STANDART" });
    const svc = items();
    for (let i = 0; i < limit; i += 1) {
      const d = await draftProduct(std.company.id, std.user.id);
      await svc.publish(std.auth, d.id);
    }
    const extra = await draftProduct(std.company.id, std.user.id);
    await expect(svc.publish(std.auth, extra.id)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(svc.publish(std.auth, extra.id)).rejects.toThrow(/en fazla 10 ürün/);
    // Taslak kalır, silinmez.
    expect((await prisma.companyItem.findUniqueOrThrow({ where: { id: extra.id } })).isPublic).toBe(false);
    // Zaten yayında olanı yeniden yayımlamak (güncelleme) tavana takılmaz.
    const first = await prisma.companyItem.findFirstOrThrow({ where: { companyId: std.company.id, isPublic: true } });
    await expect(svc.publish(std.auth, first.id)).resolves.toBeTruthy();
    // Liste yanıtı tavanı taşır (web "N/10").
    const listed = await svc.list(std.company.id, { tier: std.auth.tier });
    expect(listed.productLimit).toBe(limit);
    expect(listed.counts.published).toBe(limit);

    const silver = await makeCompanyWithUser(prisma, { tier: "SILVER" });
    for (let i = 0; i < limit + 1; i += 1) {
      const d = await draftProduct(silver.company.id, silver.user.id);
      await svc.publish(silver.auth, d.id);
    }
    expect((await svc.list(silver.company.id, { tier: silver.auth.tier })).productLimit).toBeNull();
  });

  it("STANDART: belge ve video alanları DOKUNULMADAN kalır (yeni eklenemez, mevcut silinmez); SILVER yazar", async () => {
    const svc = items();
    const std = await makeCompanyWithUser(prisma, { tier: "STANDART" });
    const p = await draftProduct(std.company.id, std.user.id, {
      documents: [{ url: "https://cdn.rothern.com/eski.pdf", title: "Eski katalog" }],
    });
    const saved = await svc.updateShowcase(std.auth, p.id, {
      videoUrl: "https://www.youtube.com/watch?v=abc",
      documents: [{ url: "https://cdn.rothern.com/yeni.pdf", title: "Yeni" }],
    });
    expect(saved.videoUrl).toBeNull();
    expect(saved.documents).toEqual([{ url: "https://cdn.rothern.com/eski.pdf", title: "Eski katalog" }]);

    const silver = await makeCompanyWithUser(prisma, { tier: "SILVER" });
    const q = await draftProduct(silver.company.id, silver.user.id);
    const ok = await svc.updateShowcase(silver.auth, q.id, {
      videoUrl: "https://www.youtube.com/watch?v=abc",
      documents: [{ url: "https://cdn.rothern.com/yeni.pdf", title: "Yeni" }],
    });
    expect(ok.videoUrl).toBe("https://www.youtube.com/watch?v=abc");
    expect(ok.documents).toEqual([{ url: "https://cdn.rothern.com/yeni.pdf", title: "Yeni" }]);
  });

  it("belge yükleme uçları paket kapılı (CompanyPaidTierGuard metadata'sı)", () => {
    for (const handler of ["documentUploadUrl", "documentResolve"] as const) {
      const guards = (Reflect.getMetadata("__guards__", CompanyItemsController.prototype[handler]) ?? []) as unknown[];
      expect(guards).toContain(CompanyPaidTierGuard);
    }
    // Görsel yükleme her pakete açık — ürün görseli yayın kapısının parçası.
    const imageGuards = (Reflect.getMetadata("__guards__", CompanyItemsController.prototype.imageUploadUrl) ?? []) as unknown[];
    expect(imageGuards).not.toContain(CompanyPaidTierGuard);
  });
});

describe("ücretsiz vitrin — profil, dizin ve sıra", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("STANDART firmanın herkese açık profili 200 döner ve doğrulanmamış işaretlenir", async () => {
    // Fabrika varsayılanı VERIFIED — ücretsiz firma tipik olarak doğrulanmamış.
    const std = await listedCompany("STANDART", "ucretsiz-sanayi", "UNVERIFIED");
    const svc = new PublicProfileService(prisma as unknown as PrismaBypassService);
    const prof = await svc.getBySlug("ucretsiz-sanayi");
    expect(prof.name).toBe(std.company.name);
    expect(prof.verified).toBe(false);
  });

  it("dizin: ücretsiz firma listelenir ama PAKETLİ firma daha yeni olmasa da ÖNCE gelir", async () => {
    const free = await listedCompany("STANDART", "free-co");
    const paid = await listedCompany("SILVER", "paid-co");
    // Ücretsiz firma en son güncellenen olsun — yine de paketli önde.
    await prisma.company.update({ where: { id: free.company.id }, data: { industry: "Güncel" } });
    const dir = await buildDirectory(prisma, {});
    expect(dir.items.map((c) => c.slug)).toEqual(["paid-co", "free-co"]);
  });

  it("dizin: süresi DOLMUŞ paket ücretsiz gibi sıralanır (INV-TIER-1) — ama listede kalır", async () => {
    const expired = await listedCompany("GOLD", "expired-co");
    await prisma.company.update({
      where: { id: expired.company.id },
      data: { membershipEndAt: new Date(Date.now() - 86_400_000) },
    });
    await listedCompany("SILVER", "live-co");
    await prisma.company.update({ where: { id: expired.company.id }, data: { industry: "Güncel" } });
    const dir = await buildDirectory(prisma, {});
    expect(dir.items.map((c) => c.slug)).toEqual(["live-co", "expired-co"]);
  });
});
