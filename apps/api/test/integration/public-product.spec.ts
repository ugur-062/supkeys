/**
 * HERKESE AÇIK ÜRÜN — kapı ve sızıntı sözleşmesi.
 *
 * Kritik ayrım burada kilitleniyor:
 *   ilan sayfası = İŞLEM  → sahip ANONİM
 *   ürün sayfası = VİTRİN → firma ADIYLA (opt-in, satılan özellik)
 * İkisi karışırsa ya vitrin işe yaramaz ya alıcının kimliği sızar.
 */
import { NotFoundException } from "@nestjs/common";
import { PublicProfileController } from "../../src/modules/public-profile/public-profile.controller";
import { PublicProfileService } from "../../src/modules/public-profile/public-profile.service";
import type { PrismaBypassService } from "../../src/common/prisma/prisma.service";
import { prisma, truncateAll } from "./test-db";
import { makeCompanyWithUser } from "./factories";

const service = () =>
  new PublicProfileService(prisma as unknown as PrismaBypassService);

/** Ürün yanıtında ASLA görünmemesi gerekenler. */
const FORBIDDEN = [
  "code", // firma içi stok kodu
  "targetPrice", // kalem kataloğunun ALIŞ hedefi — maliyet sızar
  "usageCount",
  "lastUsedAt",
  "createdById",
  "completionScore", // iç kalite ölçütü
  "companyId",
  "isPublic",
  "isActive",
];

function allKeys(v: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(v)) { v.forEach((x) => allKeys(x, out)); return out; }
  if (v && typeof v === "object" && !(v instanceof Date)) {
    for (const [k, c] of Object.entries(v)) { out.add(k); allKeys(c, out); }
  }
  return out;
}

let seq = 0;
async function seedCompanyWithProduct(
  companyOver: Record<string, unknown> = {},
  productOver: Record<string, unknown> = {},
) {
  seq += 1;
  const { company, user } = await makeCompanyWithUser(prisma);
  const patched = await prisma.company.update({
    where: { id: company.id },
    data: {
      name: `Vitrin Sanayi ${seq}`,
      slug: `vitrin-${seq}`,
      city: "İstanbul",
      publicEnabled: true,
      ...companyOver,
    },
  });
  const product = await prisma.companyItem.create({
    data: {
      companyId: company.id,
      createdById: user.id,
      name: "Dağıtım panosu 400A",
      unit: "adet",
      slug: `pano-${seq}`,
      code: "GIZLI-KOD-1",
      targetPrice: 999,
      description: "x".repeat(120),
      images: ["a.webp"],
      keywords: ["pano"],
      isPublic: true,
      publishedAt: new Date(),
      searchText: "dagitim panosu 400a pano",
      ...productOver,
    },
  });
  return { company: patched, product };
}

describe("ürün vitrini — kapı", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("firma + ürün kapıdan geçince görünür", async () => {
    const { company, product } = await seedCompanyWithProduct();
    const list = await service().listPublicProducts(company.slug as string);
    expect(list.total).toBe(1);
    expect(list.items[0].slug).toBe(product.slug);

    const one = await service().getPublicProduct(
      company.slug as string,
      product.slug as string,
    );
    expect(one.product.name).toBe("Dağıtım panosu 400A");
  });

  it("FİRMA public profil rızası yoksa 404 — 'var ama gizli' bile denmez", async () => {
    const { company } = await seedCompanyWithProduct({ publicEnabled: false });
    await expect(
      service().listPublicProducts(company.slug as string),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("STANDART paketli firmanın vitrini kapalı (profil SILVER+ ister)", async () => {
    const { company } = await seedCompanyWithProduct({ tier: "STANDART" });
    await expect(
      service().listPublicProducts(company.slug as string),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("bloklu/pasif firma görünmez", async () => {
    const a = await seedCompanyWithProduct({ isBlocked: true });
    const b = await seedCompanyWithProduct({ isActive: false });
    for (const c of [a.company, b.company]) {
      await expect(
        service().listPublicProducts(c.slug as string),
      ).rejects.toBeInstanceOf(NotFoundException);
    }
  });

  it("YAYIMLANMAMIŞ ürün listede yok, tekil sorguda 404", async () => {
    const { company, product } = await seedCompanyWithProduct({}, {
      isPublic: false,
    });
    expect((await service().listPublicProducts(company.slug as string)).total).toBe(0);
    await expect(
      service().getPublicProduct(company.slug as string, product.slug as string),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("arşivlenmiş (isActive=false) ürün görünmez", async () => {
    const { company } = await seedCompanyWithProduct({}, { isActive: false });
    expect((await service().listPublicProducts(company.slug as string)).total).toBe(0);
  });
});

describe("ürün vitrini — sızıntı", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("iç alanlar yanıtta YOK", async () => {
    const { company, product } = await seedCompanyWithProduct();
    const one = await service().getPublicProduct(
      company.slug as string,
      product.slug as string,
    );
    const keys = allKeys(one);
    expect(FORBIDDEN.filter((k) => keys.has(k))).toEqual([]);
    // Alış hedefi ve stok kodu metin olarak da geçmemeli.
    const json = JSON.stringify(one);
    expect(json).not.toContain("GIZLI-KOD-1");
    expect(json).not.toContain("999");
  });

  it("FİRMA ADI ürün sayfasında GÖRÜNÜR — ilanın tersi, bilinçli", async () => {
    const { company, product } = await seedCompanyWithProduct();
    const one = await service().getPublicProduct(
      company.slug as string,
      product.slug as string,
    );
    expect(one.company.name).toBe(company.name);
    expect(one.company.slug).toBe(company.slug);
  });
});

describe("ürün vitrini — arama ve sitemap", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("firma içi arama searchText üzerinden çalışır", async () => {
    const { company } = await seedCompanyWithProduct();
    expect((await service().listPublicProducts(company.slug as string, { q: "pano" })).total).toBe(1);
    expect((await service().listPublicProducts(company.slug as string, { q: "vinç" })).total).toBe(0);
  });

  it("kategori süzgeci ATA ZİNCİRİNİ kapsar — segment seçen yaprakları görür", async () => {
    const { company } = await seedCompanyWithProduct({}, { categoryId: "39122215" });
    // Segment kodu verildi; yaprak ürün yine gelmeli.
    expect((await service().listPublicProducts(company.slug as string, { categoryId: "39000000" })).total).toBe(1);
    // Başka segment eşleşmemeli.
    expect((await service().listPublicProducts(company.slug as string, { categoryId: "50000000" })).total).toBe(0);
  });

  it("sitemap yalnız kapıdan geçenleri döner", async () => {
    await seedCompanyWithProduct();
    await seedCompanyWithProduct({ publicEnabled: false });
    await seedCompanyWithProduct({}, { isPublic: false });
    const map = await service().productSitemap();
    expect(map).toHaveLength(1);
    expect(map[0].companySlug).toBeTruthy();
    expect(map[0].slug).toBeTruthy();
  });
});

describe("pazar yeri anahtarı — GÖRÜNÜRLÜK ≠ İNDEKSLENME", () => {
  /**
   * 2026-09-03: ürün sayfası anahtara bağlıydı ve panel "vitrinde yayımlandı"
   * dedikten sonra bağlantı 404 veriyordu. Ürün firmanın ZATEN AÇIK olan
   * profilinin altında yaşıyor → görünürlük profil kapısına bağlı. İndeksleme
   * ise anahtarda kalır: sitemap gated, sayfa `noindex`.
   */
  const guardsOf = (method: string): string[] =>
    (
      (Reflect.getMetadata("__guards__", PublicProfileController.prototype[method as never]) ??
        []) as { name: string }[]
    ).map((g) => g.name);

  it("firma-altı ürün uçları anahtara TABİ DEĞİL", () => {
    expect(guardsOf("products")).not.toContain("MarketplaceLiveGuard");
    expect(guardsOf("product")).not.toContain("MarketplaceLiveGuard");
  });

  it("ürün SİTEMAP'i anahtara TABİ", () => {
    expect(guardsOf("productSitemap")).toContain("MarketplaceLiveGuard");
  });
});
