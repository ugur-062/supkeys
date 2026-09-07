/**
 * PANEL PAZAR KATMANI — üye ↔ ziyaretçi PARİTESİ (2026-09-07).
 *
 * "Üye, ziyaretçinin gördüğü her şeyi görür + üyeye özel alanlar" kuralının
 * keşif yüzeyindeki karşılığı. Denetimde bu kural üç yerde kırılmıştı ve
 * hepsi SESSİZDİ — hata vermiyor, yalnız daha az sonuç/daha az süzgeç
 * gösteriyordu:
 *
 *   1. Panel nitelik facet'i tip adını yanlış yazıyordu ("SELECT" vs
 *      "SINGLE_SELECT") → kenar çubuğunda nitelik grubu HİÇ çıkmıyordu.
 *   2. Panel dizin facet'leri parametre almıyordu → sayaçlar aramadan
 *      bağımsızdı ("İstanbul (7)" tıklanınca liste boşalabiliyordu).
 *   3. Panel dizini `gold`/`sort` bilmiyordu, `category` tek koddu.
 */
import { CompanyItemsService } from "../../src/modules/company-items/company-items.service";
import { buildDirectory, directoryFacets } from "../../src/common/company/company-directory";
import { subCategoryCounts } from "../../src/common/company/product-index";
import type { PrismaBypassService } from "../../src/common/prisma/prisma.service";
import { prisma, truncateAll } from "./test-db";
import { makeCompanyWithUser } from "./factories";

const stub = () => ({}) as never;
/**
 * Rig: yapıcı (prisma, audit, storage, views?) — `views` VERİLMEZ.
 *
 * Eskiden dört stub geçiliyordu: fazladan `{}` opsiyonel `views` yuvasına
 * düşüyor ve `this.views?.recordPanelView(...)` "is not a function" ile
 * patlıyordu (ürün detayına dokunan ilk test bunu yakaladı). Yuva boş
 * kalınca `?.` zinciri kısa devre yapar — CLAUDE.md'deki "rig stub
 * gotcha"nın (b) biçimi.
 */
const items = () =>
  new CompanyItemsService(prisma as unknown as PrismaBypassService, stub(), stub());

async function makeCategory(code: string, nameTr: string, level: number, parentId: string | null = null) {
  await prisma.category.create({
    data: {
      id: code, code, nameTr, keywords: "", searchText: nameTr.toLowerCase(),
      level, parentId, isActive: true, sortOrder: 0,
    },
  });
}

let seq = 0;
async function seedSeller(over: Record<string, unknown> = {}, product: Record<string, unknown> = {}) {
  seq += 1;
  const { company, user } = await makeCompanyWithUser(prisma);
  const patched = await prisma.company.update({
    where: { id: company.id },
    data: {
      name: `Pano Sanayi ${seq}`,
      slug: `pano-sanayi-${seq}`,
      city: "İstanbul",
      publicEnabled: true,
      ...over,
    },
  });
  await prisma.companyItem.create({
    data: {
      companyId: company.id,
      createdById: user.id,
      name: `Dağıtım panosu ${seq}`,
      unit: "adet",
      slug: `pano-${seq}`,
      categoryId: "39121000",
      description: "x".repeat(120),
      images: ["a.webp"],
      keywords: ["pano"],
      isPublic: true,
      publishedAt: new Date(),
      searchText: "dagitim panosu pano",
      ...product,
    },
  });
  return patched;
}

describe("panel pazar katmanı — parite", () => {
  beforeEach(async () => {
    await truncateAll();
    await makeCategory("39000000", "Elektrik Sistemleri", 1);
    await makeCategory("39120000", "Elektrik ekipmanı", 2, "39000000");
    await makeCategory("39121000", "Dağıtım panoları", 3, "39120000");
  });

  it("nitelik facet'i panelde DOLU gelir (tip adı Prisma enum'ıyla birebir)", async () => {
    await prisma.categoryAttribute.create({
      data: {
        categoryId: "39000000",
        groupKey: "koruma_sinifi",
        nameTr: "Koruma sınıfı",
        type: "SINGLE_SELECT",
        options: ["IP54", "IP65"],
        unit: null,
        isRequired: false,
        sortOrder: 0,
      },
    });
    await seedSeller({}, { attributes: { koruma_sinifi: "IP65" } });
    const buyer = await makeCompanyWithUser(prisma);
    const facets = await items().discoverFacets(
      { companyId: buyer.company.id, userId: buyer.user.id } as never,
      { category: "39000000" },
    );
    expect(facets.attributes).toHaveLength(1);
    expect(facets.attributes[0]).toMatchObject({ key: "koruma_sinifi", nameTr: "Koruma sınıfı" });
    expect(facets.attributes[0].values).toEqual([{ value: "IP65", count: 1 }]);
  });

  it("kategori seçilince ALT KIRILIM sayacı döner (kategori sayfasının çipleri)", async () => {
    await seedSeller();
    const buyer = await makeCompanyWithUser(prisma);
    const facets = await items().discoverFacets(
      { companyId: buyer.company.id, userId: buyer.user.id } as never,
      { category: "39000000" },
    );
    // Segment seçildi → bir alt seviye (L2 aile) sayılır, L1'e yuvarlanmaz.
    expect(facets.subCategories).toEqual([
      { id: "39120000", name: "Elektrik ekipmanı", level: 2, count: 1 },
    ]);
    // Kategori seçilmemişken alt kırılım YOK — kenar çubuğunda anlamsız olurdu.
    const none = await items().discoverFacets(
      { companyId: buyer.company.id, userId: buyer.user.id } as never,
      {},
    );
    expect(none.subCategories).toEqual([]);
  });

  it("panel ürün detayı KATEGORİ ADINI taşır (kırıntı ve kategori hapı için)", async () => {
    // 2026-09-08 kullanıcı bulgusu: panelde yol "Ürün Ara › Firma › Ürün"
    // idi, kategori adımı yoktu. Herkese açık uç kategoriyi çözüyordu, panel
    // ucu yalnız `categoryId` veriyordu — aynı gövde iki yüzeyde farklı
    // görünüyordu.
    const seller = await seedSeller();
    const item = await prisma.companyItem.findFirstOrThrow({ where: { companyId: seller.id } });
    const buyer = await makeCompanyWithUser(prisma);
    const detail = await items().discoverProduct(
      { companyId: buyer.company.id, userId: buyer.user.id } as never,
      seller.slug as string,
      item.slug as string,
    );
    expect(detail.product.category).toEqual({ id: "39121000", name: "Dağıtım panoları" });
  });

  it("SEÇİLİ KATEGORİ adıyla döner — ürünü olmayan dalda bile (çip ham kod yazmasın)", async () => {
    // 2026-09-08 kullanıcı bulgusu: ürünü olmayan bir dal seçilince panelde
    // süzgeç çipi "45000000" yazıyordu. `categories` listesi yalnız L1
    // segmentleri ve YALNIZ ürünü olanları taşır; ad ayrı alandan gelir.
    await seedSeller();
    const buyer = await makeCompanyWithUser(prisma);
    const empty = await items().discoverFacets(
      { companyId: buyer.company.id, userId: buyer.user.id } as never,
      { category: "39120000" },
    );
    expect(empty.selectedCategory).toEqual({ id: "39120000", name: "Elektrik ekipmanı", level: 2 });
    // Kategori seçilmemişken alan null — uydurma bir seçim döndürülmez.
    const none = await items().discoverFacets(
      { companyId: buyer.company.id, userId: buyer.user.id } as never,
      {},
    );
    expect(none.selectedCategory).toBeNull();
  });

  it("alt kırılım yaprakta boş döner — 'L4'ün altı' uydurulmaz", () => {
    const rows = [{ categoryId: "39121501", company: { city: null, activities: [] } }];
    expect(subCategoryCounts(rows, "39121501")).toEqual([]);
  });

  it("kart 3 maddelik özellik satırı taşır; niteliği olmayan üründe alan HİÇ gelmez", async () => {
    await prisma.categoryAttribute.create({
      data: {
        categoryId: "39000000", groupKey: "guc", nameTr: "Güç", type: "NUMBER",
        options: [], unit: "kVAr", isRequired: false, sortOrder: 0,
      },
    });
    await seedSeller({}, { attributes: { guc: "400" } });
    await seedSeller({ slug: "pano-sanayi-bos" }, { slug: "pano-bos", attributes: {} });
    const buyer = await makeCompanyWithUser(prisma);
    const res = await items().discoverSearch(
      { companyId: buyer.company.id, userId: buyer.user.id } as never,
      { sort: "newest" },
    );
    const withAttr = res.items.find((p) => p.slug !== "pano-bos");
    const without = res.items.find((p) => p.slug === "pano-bos");
    expect(withAttr?.features).toEqual(["Güç: 400 kVAr"]);
    expect(without?.features).toBeUndefined();
  });

  it("dizin facet'leri BAĞLAMSAL: arama uygulanır, kendi boyutu hariç tutulur", async () => {
    await seedSeller({ name: "Trakya Pano", slug: "trakya-pano", city: "İstanbul" });
    await seedSeller({ name: "Ege Kablo", slug: "ege-kablo", city: "İzmir" });
    const all = await directoryFacets(prisma, {}, {});
    expect(all.cities.map((c) => c.city).sort()).toEqual(["İstanbul", "İzmir"]);
    // Arama daraltır — eskiden facet ucu `q` hiç almıyordu.
    const searched = await directoryFacets(prisma, {}, { q: "Trakya" });
    expect(searched.cities).toEqual([{ city: "İstanbul", count: 1 }]);
    // Şehir seçiliyken ŞEHİR sayaçları daralmaz (çoklu seçim mümkün kalsın).
    const withCity = await directoryFacets(prisma, {}, { city: "İstanbul" });
    expect(withCity.cities.map((c) => c.city).sort()).toEqual(["İstanbul", "İzmir"]);
  });

  it("dizin kartı ARAMAYA UYAN ürünleri taşır; firma adıyla eşleşen firma ürünsüz de listede kalır", async () => {
    const c = await seedSeller({ name: "Trakya Pano", slug: "trakya-pano" });
    await prisma.companyItem.create({
      data: {
        companyId: c.id,
        createdById: (await prisma.companyUser.findFirstOrThrow({ where: { companyId: c.id } })).id,
        name: "Kablo kanalı", unit: "adet", slug: "kablo-kanali", categoryId: "39121000",
        description: "y".repeat(120), images: ["b.webp"], keywords: ["kablo"],
        isPublic: true, publishedAt: new Date(), searchText: "kablo kanali",
      },
    });
    const hit = await buildDirectory(prisma, { q: "kablo" });
    expect(hit.items[0].matchedProducts.map((p) => p.slug)).toEqual(["kablo-kanali"]);
    // Firma ADIYLA bulunan firma, ürünü uymasa da düşmez (arama sessizce
    // ürün aramasına dönmemeli) — yalnız vurgulu şerit boş kalır.
    const byName = await buildDirectory(prisma, { q: "Trakya" });
    expect(byName.total).toBe(1);
    expect(byName.items[0].matchedProducts).toEqual([]);
  });

  it("dizin `restrictIds` ile daraltılır — bağlantı süzgecinin kaynağı", async () => {
    const a = await seedSeller({ name: "Bağlı Firma", slug: "bagli-firma" });
    await seedSeller({ name: "Yabancı Firma", slug: "yabanci-firma" });
    const only = await buildDirectory(prisma, {}, { restrictIds: [a.id] });
    expect(only.items.map((i) => i.slug)).toEqual(["bagli-firma"]);
    const without = await buildDirectory(prisma, {}, { excludeIds: [a.id] });
    expect(without.items.map((i) => i.slug)).toEqual(["yabanci-firma"]);
  });
});
