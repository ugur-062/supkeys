/**
 * ÇEVİRİ KAPSAMI SÖZLEŞMESİ (kullanıcı kararı 2026-09-25: "bir ürünün veya alım
 * talebinin eklendiği diller hariç diğer dillerde karşılığı olmaması mümkün değil").
 *
 * Kilitlenenler:
 *   · görünür kayıt (vitrindeki/onay bekleyen ürün, yayınlanmış talep — her
 *     durum, metni olan firma) çeviri satırı yoksa kapsam denetimi kuyruğa alır;
 *   · taslak ve metinsiz kayıt alınmaz (sonsuz yeniden kuyruk olmasın);
 *   · kaynak AYNI ama varlık başka sebeple güncellendiyse "denetlendi" damgası
 *     vurulur, bir sonraki turda yeniden seçilmez;
 *   · arama metni yazımı `updatedAt`e DOKUNMAZ (sitemap lastmod sahte değişmesin);
 *   · kalıcı FAILED 6 saat sonra yeniden denenir;
 *   · İSTEM SÜRÜMÜ artınca (özet öneki eski) DONE kayıt da yeniden kuyruğa girer,
 *     eski çeviri yeni gelene dek gösterilir ve sayfa "bekliyor" sayılmaz;
 *   · `translationPending`: kaynak dil beklemez, çevirisi olmayan dil bekler.
 */
import { SOURCE_HASH_PREFIX } from "../../src/modules/content-translation/content-translation.logic";
import { ContentTranslationService } from "../../src/modules/content-translation/content-translation.service";
import type { PrismaBypassService } from "../../src/common/prisma/prisma.service";
import { prisma, truncateAll } from "./test-db";
import { makeCompanyWithUser, makeItem, makeListing } from "./factories";

// Sağlayıcısız: `enqueue` satır açar, `kick` çeviri başlatmaz (enabled=false).
const service = () => new ContentTranslationService(prisma as unknown as PrismaBypassService);

async function seedListing(over: Record<string, unknown> = {}) {
  const { company, user } = await makeCompanyWithUser(prisma);
  const listing = await makeListing(prisma, {
    companyId: company.id,
    createdById: user.id,
    status: "AWARDED",
    visibility: "PUBLIC",
    publishedAt: new Date(),
    title: "Paslanmaz boru alımı",
    ...over,
  });
  await makeItem(prisma, listing.id, { name: "Paslanmaz boru DN50" });
  return { company, user, listing };
}

async function seedProduct(companyId: string, userId: string, over: Record<string, unknown> = {}) {
  return prisma.companyItem.create({
    data: {
      companyId,
      createdById: userId,
      name: "Dağıtım panosu",
      unit: "adet",
      keywords: ["pano"],
      ...over,
    },
  });
}

async function rowsFor(entityId: string) {
  return prisma.contentTranslation.findMany({ where: { entityId } });
}

describe("içerik çevirisi — kapsam denetimi", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("kazandırılmış/değerlendirmedeki talep de kuyruğa girer; taslak girmez", async () => {
    const { listing } = await seedListing();
    const draft = await seedListing({ status: "DRAFT", publishedAt: null });
    const r = await service().ensureCoverage();
    expect(r.listings).toBe(1);
    expect(await rowsFor(listing.id)).toHaveLength(3);
    expect(await rowsFor(draft.listing.id)).toHaveLength(0);
  });

  it("vitrindeki ve ONAY BEKLEYEN ürün girer; taslak girmez", async () => {
    const { company, user } = await makeCompanyWithUser(prisma);
    const pub = await seedProduct(company.id, user.id, { isPublic: true, reviewStatus: "APPROVED" });
    const pending = await seedProduct(company.id, user.id, { reviewStatus: "PENDING" });
    const draft = await seedProduct(company.id, user.id);
    const r = await service().ensureCoverage();
    expect(r.products).toBe(2);
    expect(await rowsFor(pub.id)).toHaveLength(3);
    expect(await rowsFor(pending.id)).toHaveLength(3);
    expect(await rowsFor(draft.id)).toHaveLength(0);
  });

  it("metni olan kayıtlı firma girer; metinsiz firma seçilmez (sonsuz kuyruk yok)", async () => {
    const a = await makeCompanyWithUser(prisma);
    const b = await makeCompanyWithUser(prisma);
    await prisma.company.update({
      where: { id: a.company.id },
      data: { onboardingCompletedAt: new Date(), industry: "Makine imalatı", aboutText: null, services: [] },
    });
    await prisma.company.update({
      where: { id: b.company.id },
      data: { onboardingCompletedAt: new Date(), industry: null, aboutText: " ", services: [] },
    });
    const r = await service().ensureCoverage();
    expect(r.companies).toBe(1);
    expect(await rowsFor(a.company.id)).toHaveLength(3);
    expect(await rowsFor(b.company.id)).toHaveLength(0);
  });

  it("kaynak aynı, varlık başka sebeple güncellendi → damga vurulur, sonraki tur seçmez", async () => {
    const { listing } = await seedListing();
    const svc = service();
    await svc.ensureCoverage();
    // Çeviri bitmiş gibi: satırlar DONE (hash enqueue'nun yazdığı kaynak özeti).
    await prisma.contentTranslation.updateMany({ where: { entityId: listing.id }, data: { status: "DONE" } });
    await new Promise((r) => setTimeout(r, 20));
    await prisma.listing.update({ where: { id: listing.id }, data: { status: "IN_AWARD" } });
    const second = await svc.ensureCoverage();
    expect(second.listings).toBe(0); // kaynak aynı → yeniden çeviri yok
    const third = await svc.ensureCoverage();
    expect(third.listings).toBe(0);
    // Seçilmedi mi? damga varlıktan yeni olmalı.
    const l = await prisma.listing.findUniqueOrThrow({ where: { id: listing.id } });
    const rows = await rowsFor(listing.id);
    expect(rows.every((row) => row.updatedAt >= l.updatedAt && row.status === "DONE")).toBe(true);
  });

  it("istem sürümü eskiyse DONE çeviri yeniden kuyruğa girer; eski çeviri korunur, sayfa beklemede sayılmaz", async () => {
    const { listing } = await seedListing();
    const svc = service();
    await svc.ensureCoverage();
    // Eski sürümün ürettiği bitmiş çeviri (önek yok — v2 öncesi biçim).
    const oldFields = { title: "Stainless pipe purchase", description: null, keywords: [], items: [] };
    await prisma.contentTranslation.updateMany({
      where: { entityId: listing.id },
      data: { status: "DONE", sourceHash: "0123456789abcdef0123456789abcdef", sourceLocale: "tr" },
    });
    await prisma.contentTranslation.update({
      where: { entityType_entityId_locale: { entityType: "LISTING", entityId: listing.id, locale: "en" } },
      data: { fields: oldFields },
    });
    const r = await svc.ensureCoverage();
    expect(r.listings).toBe(1);
    const rows = await rowsFor(listing.id);
    expect(rows.every((x) => x.status === "PENDING" && x.sourceHash.startsWith(SOURCE_HASH_PREFIX))).toBe(true);
    expect(rows.find((x) => x.locale === "en")?.fields).toEqual(oldFields);
    expect(await svc.translationPending("LISTING", listing.id, "en")).toBe(false);
    // Aynı sürümde ikinci tur seçmez (sonsuz kuyruk yok).
    expect((await svc.ensureCoverage()).listings).toBe(0);
  });

  it("arama metni yazımı updatedAt'e dokunmaz", async () => {
    const { listing } = await seedListing();
    const before = await prisma.listing.findUniqueOrThrow({ where: { id: listing.id } });
    await new Promise((r) => setTimeout(r, 20));
    await service().refreshSearchText("LISTING", listing.id);
    const after = await prisma.listing.findUniqueOrThrow({ where: { id: listing.id } });
    expect(after.searchTextI18n).toContain("paslanmaz boru");
    expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime());
  });

  it("kalıcı FAILED 6 saat sonra yeniden denenir, taze FAILED beklemede kalır", async () => {
    const { listing } = await seedListing();
    const fresh = await seedListing();
    await service().ensureCoverage();
    await prisma.contentTranslation.updateMany({ where: { entityId: listing.id }, data: { status: "FAILED", attempts: 3 } });
    await prisma.$executeRaw`UPDATE "content_translations" SET "updatedAt" = now() - interval '7 hours' WHERE "entityId" = ${listing.id}`;
    await prisma.contentTranslation.updateMany({ where: { entityId: fresh.listing.id }, data: { status: "FAILED", attempts: 3 } });
    const r = await service().ensureCoverage();
    expect(r.retried).toBe(3);
    expect((await rowsFor(listing.id)).every((x) => x.attempts === 0)).toBe(true);
    expect((await rowsFor(fresh.listing.id)).every((x) => x.attempts === 3)).toBe(true);
  });

  it("translationPending: kaynak dil ve çevirili dil beklemez, çevirisiz dil bekler", async () => {
    const { listing } = await seedListing();
    const svc = service();
    // Hiç satır yok: kaynak Türkçe varsayılır.
    expect(await svc.translationPending("LISTING", listing.id, "tr")).toBe(false);
    expect(await svc.translationPending("LISTING", listing.id, "en")).toBe(true);
    await svc.ensureCoverage(); // PENDING, fields yok, kaynak dili henüz bilinmiyor
    expect(await svc.translationPending("LISTING", listing.id, "en")).toBe(true);
    // Türkçe sayfa ilk çeviriyi (ya da kalıcı FAILED'i) beklerken noindex ALMAZ.
    expect(await svc.translationPending("LISTING", listing.id, "tr")).toBe(false);
    expect((await svc.readyLocalesFor("LISTING", [listing.id]))?.get(listing.id)).toEqual(["tr"]);
    await prisma.contentTranslation.updateMany({
      where: { entityId: listing.id, locale: "tr" },
      data: { status: "DONE", sourceLocale: "tr" },
    });
    await prisma.contentTranslation.update({
      where: { entityType_entityId_locale: { entityType: "LISTING", entityId: listing.id, locale: "en" } },
      data: { status: "DONE", sourceLocale: "tr", fields: { title: "Stainless pipe purchase", description: null, keywords: [], items: [] } },
    });
    expect(await svc.translationPending("LISTING", listing.id, "tr")).toBe(false);
    expect(await svc.translationPending("LISTING", listing.id, "en")).toBe(false);
    expect(await svc.translationPending("LISTING", listing.id, "ru")).toBe(true);
    expect((await svc.readyLocalesFor("LISTING", [listing.id, "yok"]))).toEqual(
      new Map([
        [listing.id, ["tr", "en"]],
        ["yok", ["tr"]],
      ]),
    );
  });
});
