/**
 * GİZLİ SEGMENT — SAKLANMIŞ KODUN OKUNDUĞU HERKESE AÇIK YÜZEYLER (2026-10-09).
 *
 * Sahip kuralı: "anasayfada olmayan kategori talepte, üründe ya da başka yerde
 * de gösterilmesin." Kataloğu GEZDİREN uçlar (seçici, arama, facet, mega menü)
 * `hiddenCategoryWhere` ile zaten süzülüyordu; bu dosya SAKLANMIŞ bir kodu ada /
 * çipe / kırıntıya / bağlantıya / süzgece çeviren okumaları kilitler.
 *
 * Fikstür hep ESKİ KAYIT: segment gizlenmeden önce kaydedilmiş talep, ürün ve
 * firma beyanı (46 = Kolluk ve Emniyet, 77 = Çevre Hizmetleri — ikisi de
 * 2026-10-09'da gizlendi; 10 = eski gizli segment). Değişmeyen iki şey de
 * burada: kayıt YAYINDA KALIR (yalnız gizli kategorisi görünmez) ve ilişkili
 * ürün blokları eski ürün için çalışmaya devam eder.
 */
import { Prisma } from "@rothern/db";
import { foldSearchText } from "@rothern/shared";
import { CategoryService } from "../../src/modules/categories/services/category.service";
import { PublicMarketplaceService } from "../../src/modules/public-marketplace/public-marketplace.service";
import { PublicProfileService } from "../../src/modules/public-profile/public-profile.service";
import { buildDirectory, directoryFacets } from "../../src/common/company/company-directory";
import type { PrismaBypassService, PrismaService } from "../../src/common/prisma/prisma.service";
import { prisma, truncateAll } from "./test-db";
import { makeCompanyWithUser, makeItem, makeListing } from "./factories";

const categories = () => new CategoryService(prisma as unknown as PrismaService);
const market = () => new PublicMarketplaceService(prisma as unknown as PrismaBypassService);
const profiles = () => new PublicProfileService(prisma as unknown as PrismaBypassService);

/** Gizli segment (46) ağacı — adlar yanıtta ARANABİLSİN diye ayırt edici. */
const HIDDEN_SEG = "46000000";
const HIDDEN_FAM = "46180000";
const HIDDEN_CLS = "46181500";
const HIDDEN_SEG_NAME = "Kolluk ve Emniyet Ekipmanlari";
const HIDDEN_FAM_NAME = "Kisisel Guvenlik Donanimi";
const HIDDEN_CLS_NAME = "Koruyucu Guvenlik Giysileri";
/** İkinci gizli segment (77) ve eski gizli segment (10). */
const HIDDEN_SEG_2 = "77000000";
const HIDDEN_SEG_2_NAME = "Cevre Hizmetleri Gizli";
const LEGACY_CLS = "10101500";
const LEGACY_CLS_NAME = "Canli Hayvanlar Gizli";
/** Görünür segment (39 — elektrik). */
const SEG = "39000000";
const FAM = "39120000";
const CLS = "39121000";
const SEG_NAME = "Elektrik Malzemeleri";
const CLS_NAME = "Dagitim Panolari";

const HIDDEN_NAMES = [HIDDEN_SEG_NAME, HIDDEN_FAM_NAME, HIDDEN_CLS_NAME, HIDDEN_SEG_2_NAME, LEGACY_CLS_NAME];
const HIDDEN_CODES = [HIDDEN_SEG, HIDDEN_FAM, HIDDEN_CLS, HIDDEN_SEG_2, LEGACY_CLS];

/** Yanıtta gizli kategorinin ne ADI ne KODU geçer. */
function expectNoHiddenCategory(payload: unknown) {
  const json = JSON.stringify(payload);
  for (const name of HIDDEN_NAMES) expect(json).not.toContain(name);
  for (const code of HIDDEN_CODES) expect(json).not.toContain(code);
}

async function makeCategory(code: string, nameTr: string, level: number, parentId: string | null = null) {
  await prisma.category.create({
    data: {
      id: code,
      code,
      nameTr,
      keywords: "",
      searchText: foldSearchText(nameTr),
      level,
      parentId,
      isActive: true,
      sortOrder: 0,
      inDiscovery: true,
    },
  });
}

/** Gizli iki segment + eski gizli sınıf + görünür bir dal. */
async function seedCatalog() {
  await makeCategory(HIDDEN_SEG, HIDDEN_SEG_NAME, 1);
  await makeCategory(HIDDEN_FAM, HIDDEN_FAM_NAME, 2, HIDDEN_SEG);
  await makeCategory(HIDDEN_CLS, HIDDEN_CLS_NAME, 3, HIDDEN_FAM);
  await makeCategory(HIDDEN_SEG_2, HIDDEN_SEG_2_NAME, 1);
  await makeCategory(LEGACY_CLS, LEGACY_CLS_NAME, 3);
  await makeCategory(SEG, SEG_NAME, 1);
  await makeCategory(FAM, "Elektrik Dagitim", 2, SEG);
  await makeCategory(CLS, CLS_NAME, 3, FAM);
}

let seq = 0;

async function seedCompany(over: Partial<Prisma.CompanyUncheckedCreateInput> = {}) {
  seq += 1;
  const { company, user } = await makeCompanyWithUser(prisma);
  const patched = await prisma.company.update({
    where: { id: company.id },
    data: {
      name: `Eski Kayit Sanayi ${seq}`,
      slug: `eski-kayit-${seq}`,
      city: "İstanbul",
      publicEnabled: true,
      ...over,
    },
  });
  return { company: patched, user };
}

async function seedListing(categoryIds: string[], title: string) {
  const { company, user } = await seedCompany();
  const listing = await makeListing(prisma, {
    companyId: company.id,
    createdById: user.id,
    visibility: "PUBLIC",
    status: "OPEN",
    number: `ROT-${String(700000 + seq)}`,
    publishedAt: new Date(),
    title,
    description: "Eski talep — segment gizlenmeden önce yayımlandı.",
    categoryIds,
  });
  await makeItem(prisma, listing.id, { name: "Kalem" });
  return listing;
}

async function seedProduct(categoryId: string, name: string, companyOver: Partial<Prisma.CompanyUncheckedCreateInput> = {}) {
  const { company, user } = await seedCompany(companyOver);
  const product = await prisma.companyItem.create({
    data: {
      companyId: company.id,
      createdById: user.id,
      name,
      unit: "adet",
      slug: `urun-${seq}`,
      categoryId,
      description: "x".repeat(120),
      images: ["a.webp"],
      isPublic: true,
      publishedAt: new Date(),
      searchText: foldSearchText(name),
      attributes: { beden: "XL" },
    },
  });
  return { company, product };
}

beforeEach(async () => {
  await truncateAll();
});

describe("GET categories/by-ids — gizli segmentin kodu ÇÖZÜLMEZ", () => {
  it("saklanmış gizli kod ad/kırıntı dönmez; görünür kod eskisi gibi döner", async () => {
    await seedCatalog();
    const rows = await categories().getByIds([HIDDEN_CLS, CLS, HIDDEN_SEG, LEGACY_CLS, HIDDEN_SEG_2]);
    expect(rows.map((r) => r.id)).toEqual([CLS]);
    expect(rows[0]?.nameTr).toBe(CLS_NAME);
    expect(rows[0]?.breadcrumb).toContain(SEG_NAME);
    expectNoHiddenCategory(rows);
    // Yalnız gizli kod istendiğinde yanıt BOŞ — istemci hiçbir şey çizmez.
    expect(await categories().getByIds([HIDDEN_CLS, HIDDEN_SEG])).toEqual([]);
  });
});

describe("herkese açık talep — eski talebin gizli kategorisi görünmez", () => {
  it("kart ve detay: gizli kod ne ad ne çip ne ham kod; görünür kategori ve talebin kendisi durur", async () => {
    await seedCatalog();
    const mixed = await seedListing([HIDDEN_CLS, CLS], "Karma kategorili eski talep");
    const onlyHidden = await seedListing([HIDDEN_CLS, LEGACY_CLS], "Yalniz gizli kategorili eski talep");

    const list = await market().list({});
    expect(list.total).toBe(2); // eski kayıt YAYINDA kalır
    expectNoHiddenCategory(list);
    const byTitle = new Map(list.items.map((i) => [i.title, i]));
    expect(byTitle.get("Karma kategorili eski talep")?.categories.map((c) => c.id)).toEqual([CLS]);
    expect(byTitle.get("Yalniz gizli kategorili eski talep")?.categories).toEqual([]);

    const detail = await market().getByNumber(mixed.number as string);
    expect(detail.categories.map((c) => c.id)).toEqual([CLS]);
    expect(detail.categoryIds).toEqual([CLS]);
    expectNoHiddenCategory(detail);

    const bare = await market().getByNumber(onlyHidden.number as string);
    expect(bare.title).toBe("Yalniz gizli kategorili eski talep");
    expect(bare.categories).toEqual([]);
    expect(bare.categoryIds).toEqual([]);
    expectNoHiddenCategory(bare);
  });

  it("?category=<gizli kod> süzgeç DEĞİL: liste ve sayaçlar kategori seçilmemiş gibi", async () => {
    await seedCatalog();
    await seedListing([HIDDEN_CLS], "Eski emniyet talebi");
    await seedListing([CLS], "Pano talebi");

    for (const code of [HIDDEN_SEG, HIDDEN_FAM, HIDDEN_CLS]) {
      const res = await market().list({ category: code });
      expect(res.total).toBe(2);
      expectNoHiddenCategory(res);
    }
    // Görünür kod süzmeye devam eder.
    expect((await market().list({ category: SEG })).total).toBe(1);

    const none = await market().facets({});
    const hidden = await market().facets({ category: HIDDEN_CLS });
    expect(hidden.selectedCategory).toBeNull();
    // Bağlamsal sayaçlar süzülmedi: gizli kod "seçim yok" ile AYNI yanıtı verir.
    expect(hidden).toEqual(none);
    expect(hidden.categories.map((c) => c.id)).toEqual([SEG]);
    expectNoHiddenCategory(hidden);
    expect((await market().facets({ category: HIDDEN_SEG })).selectedCategory).toBeNull();
  });
});

describe("herkese açık ürün dizini — eski ürünün gizli kategorisi görünmez", () => {
  it("kart: ürün listede kalır, categoryId null (ton/görsel/bağlantı koddan türetilemez)", async () => {
    await seedCatalog();
    await seedProduct(HIDDEN_CLS, "Eski balistik yelek");
    await seedProduct(CLS, "Dagitim panosu");

    const list = await market().listProducts({});
    expect(list.total).toBe(2);
    const byName = new Map(list.items.map((i) => [i.name, i]));
    expect(byName.get("Eski balistik yelek")?.categoryId).toBeNull();
    expect(byName.get("Dagitim panosu")?.categoryId).toBe(CLS);
    expectNoHiddenCategory(list);

    const featured = await market().featuredProducts();
    expect(featured.find((c) => c.name === "Eski balistik yelek")?.categoryId).toBeNull();
    expectNoHiddenCategory(featured);
  });

  it("?category=<gizli kod> süzgeç DEĞİL: liste, seçili kategori, alt dal ve nitelik facet'i", async () => {
    await seedCatalog();
    // Gizli segmentte nitelik tanımı: seçilseydi nitelik süzgeci SUNULURDU.
    await prisma.categoryAttribute.create({
      data: {
        categoryId: HIDDEN_SEG,
        groupKey: "beden",
        nameTr: "Beden Gizli",
        type: "SINGLE_SELECT",
        options: ["XL", "L"],
        sortOrder: 0,
      },
    });
    await seedProduct(HIDDEN_CLS, "Eski balistik yelek");
    await seedProduct(CLS, "Dagitim panosu");

    for (const code of [HIDDEN_SEG, HIDDEN_FAM, HIDDEN_CLS]) {
      expect((await market().listProducts({ category: code })).total).toBe(2);
    }
    expect((await market().listProducts({ category: SEG })).total).toBe(1);

    const none = await market().productFacets({});
    const hidden = await market().productFacets({ category: HIDDEN_SEG });
    expect(hidden.selectedCategory).toBeNull();
    expect(hidden.subCategories).toEqual([]);
    expect(hidden.attributes).toEqual([]);
    expect(hidden.categories.map((c) => c.id)).toEqual([SEG]);
    // Sayaçlar süzülmedi (2 ürün de sayılır), "seçim yok" ile aynı yanıt.
    expect(hidden).toEqual(none);
    expect(JSON.stringify(hidden)).not.toContain("Beden Gizli");
    expectNoHiddenCategory(hidden);

    // Görünür segment eskisi gibi: seçili ad + bir alt seviye.
    const visible = await market().productFacets({ category: SEG });
    expect(visible.selectedCategory?.name).toBe(SEG_NAME);
    expect(visible.subCategories.map((c) => c.id)).toEqual([FAM]);
  });

  it("anasayfa 'popüler kategoriler': gizli sınıf ne listede ne de 20 yerden birinde", async () => {
    await seedCatalog();
    // Gizli sınıfta İKİ ürün (en kalabalık), görünür sınıfta bir.
    await seedProduct(HIDDEN_CLS, "Eski balistik yelek");
    await seedProduct(HIDDEN_CLS, "Eski kask");
    await seedProduct(CLS, "Dagitim panosu");

    const stats = await market().stats();
    expect(stats.products).toBe(3); // ürünler sayılır, yalnız kategorileri görünmez
    expect(stats.popularCategories).toEqual([{ id: CLS, name: CLS_NAME, count: 1 }]);
    expect(stats.categories).toBe(1);
    expectNoHiddenCategory(stats);
  });

  it("popüler kategoriler: 20 gizli sınıf görünür sınıfın YERİNİ tüketmez", async () => {
    await seedCatalog();
    // Adı çözülmeyen gizli sınıf zaten listeye giremez; asıl risk ilk 20'yi
    // doldurup görünür sınıfı dışarıda bırakması. 20 gizli sınıf × 2 ürün,
    // görünür sınıfta 1 ürün.
    const { company, user } = await seedCompany();
    const hiddenClasses = Array.from({ length: 20 }, (_, i) => `4618${String(15 + i)}00`);
    await prisma.companyItem.createMany({
      data: hiddenClasses.flatMap((categoryId, i) =>
        [0, 1].map((n) => ({
          companyId: company.id,
          createdById: user.id,
          name: `Eski urun ${i}-${n}`,
          unit: "adet",
          slug: `eski-urun-${i}-${n}`,
          categoryId,
          isPublic: true,
          publishedAt: new Date(),
          searchText: "eski urun",
        })),
      ),
    });
    await seedProduct(CLS, "Dagitim panosu");

    const stats = await market().stats();
    expect(stats.products).toBe(41);
    expect(stats.popularCategories).toEqual([{ id: CLS, name: CLS_NAME, count: 1 }]);
  });

  it("ilişkili ürün blokları eski ürün için ÇALIŞIR (ham koddan), kartta kod yok", async () => {
    await seedCatalog();
    const base = await seedProduct(HIDDEN_CLS, "Eski balistik yelek");
    await seedProduct(HIDDEN_CLS, "Benzer eski yelek");
    await seedProduct(CLS, "Dagitim panosu");

    const rel = await market().relatedProducts(base.company.slug as string, base.product.slug as string);
    expect(rel.similar.map((c) => c.name)).toEqual(["Benzer eski yelek"]);
    expect(rel.popular.map((c) => c.name)).toEqual(["Benzer eski yelek"]);
    expect(rel.similar[0]?.categoryId).toBeNull();
    expectNoHiddenCategory(rel);
  });
});

describe("herkese açık firma profili ve ürün sayfası", () => {
  it("profil: gizli segment beyanı kategori olarak basılmaz; görünür beyan durur", async () => {
    await seedCatalog();
    const { company } = await seedCompany({
      sellerCategoryIds: [HIDDEN_SEG, SEG],
      buyerCategoryIds: [HIDDEN_SEG_2],
    });
    const res = await profiles().getBySlug(company.slug as string);
    expect(res.categories).toEqual([{ id: SEG, name: SEG_NAME }]);
    expectNoHiddenCategory(res);
    // Kayıt değişmedi: beyan eşleştirme için yerinde.
    const stored = await prisma.company.findUniqueOrThrow({ where: { id: company.id } });
    expect(stored.sellerCategoryIds).toEqual([HIDDEN_SEG, SEG]);
    expect(stored.buyerCategoryIds).toEqual([HIDDEN_SEG_2]);
  });

  it("dizin özeti: gizli segment sayılmaz", async () => {
    await seedCatalog();
    await seedCompany({ sellerCategoryIds: [HIDDEN_SEG], buyerCategoryIds: [HIDDEN_SEG_2] });
    await seedCompany({ sellerCategoryIds: [HIDDEN_SEG, SEG] });
    const res = await profiles().directorySummary();
    expect(res.topCategories).toEqual([{ id: SEG, name: SEG_NAME, count: 1 }]);
    expectNoHiddenCategory(res);
  });

  it("gizli beyanlar görünür kategorinin YERİNİ tüketmez (profilde ilk 12, özette ilk 8)", async () => {
    await seedCatalog();
    // 12 gizli segment ÖNDE, görünür segment 13. sırada.
    const twelveHidden = ["10", "42", "43", "44", "45", "46", "48", "49", "50", "51", "52", "53"].map((s) => `${s}000000`);
    const { company } = await seedCompany({ sellerCategoryIds: [...twelveHidden, SEG] });
    // İkinci firma aynı gizli segmentleri beyan eder: özetin sayımında her
    // gizli segment 2, görünür segment 1 → süzülmeseydi ilk 8'in tamamı gizliydi.
    await seedCompany({ sellerCategoryIds: twelveHidden });

    const profile = await profiles().getBySlug(company.slug as string);
    expect(profile.categories).toEqual([{ id: SEG, name: SEG_NAME }]);

    const summary = await profiles().directorySummary();
    expect(summary.topCategories).toEqual([{ id: SEG, name: SEG_NAME, count: 1 }]);
  });

  it("ürün sayfası: eski ürün açılır; kategori adı, kodu ve segment halkası yok, nitelikler durur", async () => {
    await seedCatalog();
    await prisma.categoryAttribute.create({
      data: { categoryId: HIDDEN_SEG, groupKey: "beden", nameTr: "Beden", type: "SINGLE_SELECT", options: ["XL"], sortOrder: 0 },
    });
    const { company, product } = await seedProduct(HIDDEN_CLS, "Eski balistik yelek");
    const res = await profiles().getPublicProduct(company.slug as string, product.slug as string);
    expect(res.product.name).toBe("Eski balistik yelek");
    expect(res.product.category).toBeNull();
    expect(res.product.segment).toBeNull();
    expect(res.product.categoryId).toBeNull();
    // Ürünün KENDİ nitelik tablosu kategori değildir — kalır.
    expect(res.product.attributeList).toEqual([{ key: "beden", label: "Beden", value: "XL", unit: null }]);
    expectNoHiddenCategory(res);

    // Görünür ürün eskisi gibi: ad + kod.
    const ok = await seedProduct(CLS, "Dagitim panosu");
    const visible = await profiles().getPublicProduct(ok.company.slug as string, ok.product.slug as string);
    expect(visible.product.category).toEqual({ id: CLS, name: CLS_NAME });
    expect(visible.product.categoryId).toBe(CLS);
    expect(visible.product.segment?.id).toBe(SEG);
  });

  it("firma vitrini: kart kodu null; ?categoryId=<gizli kod> süzgeç değil", async () => {
    await seedCatalog();
    const { company, user } = await seedCompany();
    for (const [categoryId, name, slug] of [
      [HIDDEN_CLS, "Eski balistik yelek", "vitrin-yelek"],
      [CLS, "Dagitim panosu", "vitrin-pano"],
    ] as const) {
      await prisma.companyItem.create({
        data: {
          companyId: company.id,
          createdById: user.id,
          name,
          unit: "adet",
          slug,
          categoryId,
          images: ["a.webp"],
          isPublic: true,
          publishedAt: new Date(),
          searchText: foldSearchText(name),
        },
      });
    }
    const companySlug = company.slug as string;
    const all = await profiles().listPublicProducts(companySlug, {});
    expect(all.total).toBe(2);
    expect(all.items.find((i) => i.name === "Eski balistik yelek")?.categoryId).toBeNull();
    expect(all.items.find((i) => i.name === "Dagitim panosu")?.categoryId).toBe(CLS);
    expectNoHiddenCategory(all);

    expect((await profiles().listPublicProducts(companySlug, { categoryId: HIDDEN_SEG })).total).toBe(2);
    expect((await profiles().listPublicProducts(companySlug, { categoryId: HIDDEN_CLS })).total).toBe(2);
    expect((await profiles().listPublicProducts(companySlug, { categoryId: SEG })).total).toBe(1);
  });
});

describe("firma dizini — kart ana kategorisi ve kategori süzgeci", () => {
  it("ilk beyanı gizli segmentte olan firma ilk GÖRÜNÜR beyanıyla, yoksa kategorisiz listelenir", async () => {
    await seedCatalog();
    // Yayında ürün → listelenme koşulu (tamlık şartına gerek kalmasın).
    await seedProduct(CLS, "Pano A", { name: "Karma Beyan AS", sellerCategoryIds: [HIDDEN_SEG, SEG] });
    await seedProduct(CLS, "Pano B", { name: "Gizli Beyan AS", sellerCategoryIds: [HIDDEN_SEG], buyerCategoryIds: [HIDDEN_SEG_2] });

    const res = await buildDirectory(prisma, {});
    const byName = new Map(res.items.map((i) => [i.name, i]));
    expect(byName.get("Karma Beyan AS")?.mainCategory).toEqual({ id: SEG, name: SEG_NAME });
    expect(byName.get("Gizli Beyan AS")?.mainCategory).toBeNull();
    expectNoHiddenCategory(res);

    // Herkese açık uç da aynı kartı verir.
    const pub = await profiles().publicDirectory({});
    expect(pub.total).toBe(2);
    expectNoHiddenCategory(pub);
  });

  it("?category=<gizli kod> süzgeç DEĞİL: liste ve sayaçlar daralmaz; görünür kod daraltır", async () => {
    await seedCatalog();
    await seedProduct(CLS, "Pano A", { name: "Karma Beyan AS", sellerCategoryIds: [HIDDEN_SEG, SEG] });
    await seedProduct(CLS, "Pano B", { name: "Gizli Beyan AS", sellerCategoryIds: [HIDDEN_SEG] });

    expect((await buildDirectory(prisma, { category: HIDDEN_SEG })).total).toBe(2);
    expect((await buildDirectory(prisma, { category: SEG })).total).toBe(1);
    // Karışık seçimde gizli kod düşer, görünür kod süzmeye devam eder.
    expect((await buildDirectory(prisma, { category: `${HIDDEN_SEG},${SEG}` })).total).toBe(1);

    const none = await directoryFacets(prisma, {}, {});
    const hidden = await directoryFacets(prisma, {}, { category: HIDDEN_SEG });
    expect(hidden.total).toBe(2);
    expect(hidden).toEqual(none);
    expect(hidden.categories.map((c) => c.id)).toEqual([SEG]);
    expectNoHiddenCategory(hidden);
  });
});
