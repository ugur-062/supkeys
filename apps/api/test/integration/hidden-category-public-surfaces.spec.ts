/**
 * GİZLİ DAL — SAKLANMIŞ KODUN OKUNDUĞU HERKESE AÇIK YÜZEYLER (2026-10-09).
 *
 * Sahip kuralı: "anasayfada olmayan kategori talepte, üründe ya da başka yerde
 * de gösterilmesin." Kataloğu GEZDİREN uçlar (seçici, arama, facet, mega menü)
 * `hiddenCategoryWhere` ile zaten süzülüyordu; bu dosya SAKLANMIŞ bir kodu ada /
 * çipe / kırıntıya / bağlantıya / süzgece çeviren okumaları kilitler.
 *
 * Fikstür hep ESKİ KAYIT: dal gizlenmeden önce kaydedilmiş talep, ürün ve
 * firma beyanı (53 = Giyim, 77 = Çevre Hizmetleri, 10 = eski gizli segment).
 * Değişmeyen iki şey de burada: kayıt YAYINDA KALIR (yalnız gizli kategorisi
 * görünmez) ve ilişkili ürün blokları eski ürün için çalışmaya devam eder.
 *
 * 2026-10-10 (sahip kararı): gizlemenin birimi KOD ÖNEKİ. 46 "İş Güvenliği ve
 * Yangın Ekipmanları" adıyla GÖRÜNÜR; altında silah / kolluk aileleri (4610 …)
 * ve 4618 ailesinin 461825 sınıfı gizli. Dosyanın son bölümü bunu kilitler:
 * gizli aile ve gizli sınıf her yüzeyde gizli segment gibi davranır, 46181500
 * sıradan kategoridir ve 4610… altında saklanmış ürün / talep / firma beyanı
 * 46000000 altında ne listelenir ne sayılır.
 */
import { Prisma } from "@rothern/db";
import { foldSearchText } from "@rothern/shared";
import { CategoryService } from "../../src/modules/categories/services/category.service";
import { PublicMarketplaceService } from "../../src/modules/public-marketplace/public-marketplace.service";
import { PublicSitemapService } from "../../src/modules/public-marketplace/public-sitemap.service";
import { PublicProfileService } from "../../src/modules/public-profile/public-profile.service";
import { buildDirectory, directoryFacets } from "../../src/common/company/company-directory";
import type { PrismaBypassService, PrismaService } from "../../src/common/prisma/prisma.service";
import { prisma, truncateAll } from "./test-db";
import { makeCompanyWithUser, makeItem, makeListing } from "./factories";

const categories = () => new CategoryService(prisma as unknown as PrismaService);
const market = () => new PublicMarketplaceService(prisma as unknown as PrismaBypassService);
const profiles = () => new PublicProfileService(prisma as unknown as PrismaBypassService);
const sitemap = () => new PublicSitemapService(prisma as unknown as PrismaBypassService);

/** Tümüyle gizli segment (53) ağacı — adlar yanıtta ARANABİLSİN diye ayırt edici. */
const HIDDEN_SEG = "53000000";
const HIDDEN_FAM = "53100000";
const HIDDEN_CLS = "53101500";
const HIDDEN_SEG_NAME = "Giyim ve Kisisel Bakim Gizli";
const HIDDEN_FAM_NAME = "Giysiler Gizli";
const HIDDEN_CLS_NAME = "Eski Is Kiyafetleri Gizli";
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
/**
 * 46 — GÖRÜNÜR segment, altında gizli dallar (2026-10-10):
 *   4610 gizli AİLE (silah) → sınıfı 461015;
 *   4618 görünür aile (kişisel koruyucu) → görünür sınıf 461815, gizli SINIF 461825 → yaprağı 46182501;
 *   4619 görünür aile (yangın) → sınıf 461916.
 */
const SAFETY_SEG = "46000000";
const SAFETY_SEG_NAME = "Is Guvenligi ve Yangin Ekipmanlari";
const WEAPON_FAM = "46100000";
const WEAPON_FAM_NAME = "Hafif Silahlar Gizli";
const WEAPON_CLS = "46101500";
const WEAPON_CLS_NAME = "Atesli Silahlar Gizli";
const PPE_FAM = "46180000";
const PPE_FAM_NAME = "Kisisel Koruyucu Donanim";
const PPE_CLS = "46181500";
const PPE_CLS_NAME = "Koruyucu Giysiler";
const SPRAY_CLS = "46182500";
const SPRAY_CLS_NAME = "Kisisel Savunma Cihazlari Gizli";
const SPRAY_LEAF = "46182501";
const SPRAY_LEAF_NAME = "Biber Gazi Gizli";
const FIRE_FAM = "46190000";
const FIRE_FAM_NAME = "Yangindan Korunma";
const FIRE_CLS = "46191600";
const FIRE_CLS_NAME = "Yangin Sondurme Ekipmanlari";

const HIDDEN_NAMES = [
  HIDDEN_SEG_NAME,
  HIDDEN_FAM_NAME,
  HIDDEN_CLS_NAME,
  HIDDEN_SEG_2_NAME,
  LEGACY_CLS_NAME,
  WEAPON_FAM_NAME,
  WEAPON_CLS_NAME,
  SPRAY_CLS_NAME,
  SPRAY_LEAF_NAME,
];
const HIDDEN_CODES = [HIDDEN_SEG, HIDDEN_FAM, HIDDEN_CLS, HIDDEN_SEG_2, LEGACY_CLS, WEAPON_FAM, WEAPON_CLS, SPRAY_CLS, SPRAY_LEAF];

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

/** Gizli iki segment + eski gizli sınıf + görünür bir dal + 46 (görünür segment, gizli dallarıyla). */
async function seedCatalog() {
  await makeCategory(HIDDEN_SEG, HIDDEN_SEG_NAME, 1);
  await makeCategory(HIDDEN_FAM, HIDDEN_FAM_NAME, 2, HIDDEN_SEG);
  await makeCategory(HIDDEN_CLS, HIDDEN_CLS_NAME, 3, HIDDEN_FAM);
  await makeCategory(HIDDEN_SEG_2, HIDDEN_SEG_2_NAME, 1);
  await makeCategory(LEGACY_CLS, LEGACY_CLS_NAME, 3);
  await makeCategory(SEG, SEG_NAME, 1);
  await makeCategory(FAM, "Elektrik Dagitim", 2, SEG);
  await makeCategory(CLS, CLS_NAME, 3, FAM);
  await makeCategory(SAFETY_SEG, SAFETY_SEG_NAME, 1);
  await makeCategory(WEAPON_FAM, WEAPON_FAM_NAME, 2, SAFETY_SEG);
  await makeCategory(WEAPON_CLS, WEAPON_CLS_NAME, 3, WEAPON_FAM);
  await makeCategory(PPE_FAM, PPE_FAM_NAME, 2, SAFETY_SEG);
  await makeCategory(PPE_CLS, PPE_CLS_NAME, 3, PPE_FAM);
  await makeCategory(SPRAY_CLS, SPRAY_CLS_NAME, 3, PPE_FAM);
  await makeCategory(SPRAY_LEAF, SPRAY_LEAF_NAME, 4, SPRAY_CLS);
  await makeCategory(FIRE_FAM, FIRE_FAM_NAME, 2, SAFETY_SEG);
  await makeCategory(FIRE_CLS, FIRE_CLS_NAME, 3, FIRE_FAM);
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
    description: "Eski talep — dal gizlenmeden önce yayımlandı.",
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
    await seedListing([HIDDEN_CLS], "Eski giyim talebi");
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
    const hiddenClasses = Array.from({ length: 20 }, (_, i) => `5310${String(15 + i)}00`);
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
    const twelveHidden = ["10", "42", "43", "44", "45", "54", "48", "49", "50", "51", "52", "53"].map((s) => `${s}000000`);
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

/* ====================================================================== */
/* 2026-10-10 — 46 GÖRÜNÜR, SİLAH / KOLLUK DALLARI GİZLİ (kural artık ÖNEK) */
/* ====================================================================== */

describe("46 kataloğu — gizli aile ve gizli sınıf seçicide / çözücüde yok, görünür dallar var", () => {
  it("by-ids: gizli aile ve gizli sınıfın kodları çözülmez; 46'nın görünür kodları adıyla ve kırıntısıyla döner", async () => {
    await seedCatalog();
    const rows = await categories().getByIds([WEAPON_FAM, WEAPON_CLS, SPRAY_CLS, SPRAY_LEAF, SAFETY_SEG, PPE_FAM, PPE_CLS]);
    expect(rows.map((r) => r.id).sort()).toEqual([SAFETY_SEG, PPE_FAM, PPE_CLS].sort());
    const cls = rows.find((r) => r.id === PPE_CLS);
    expect(cls?.nameTr).toBe(PPE_CLS_NAME);
    expect(cls?.breadcrumb).toContain(SAFETY_SEG_NAME);
    expect(cls?.breadcrumb).toContain(PPE_FAM_NAME);
    expectNoHiddenCategory(rows);
    expect(await categories().getByIds([WEAPON_CLS, SPRAY_LEAF])).toEqual([]);
  });

  it("segment listesi ve üst katman: 46 görünür; gizli aile listede yok, alt sayısına da girmez", async () => {
    await seedCatalog();
    const segments = await categories().getSegments();
    const safety = segments.find((c) => c.id === SAFETY_SEG);
    expect(safety?.nameTr).toBe(SAFETY_SEG_NAME);
    // Üç aileden ikisi görünür (4618, 4619); 4610 sayılmaz.
    expect(safety?.childCount).toBe(2);
    expect(segments.map((c) => c.id)).not.toContain(HIDDEN_SEG);

    const top = await categories().getAllActive();
    const ids = top.map((c) => c.id);
    expect(ids).toEqual(expect.arrayContaining([SAFETY_SEG, PPE_FAM, FIRE_FAM]));
    expect(ids).not.toContain(WEAPON_FAM);
    // 4618'in iki sınıfından biri (461825) gizli.
    expect(top.find((c) => c.id === PPE_FAM)?.childCount).toBe(1);
    expectNoHiddenCategory(top);
  });

  it("alt liste: görünür atanın gizli çocuğu dönmez; gizli atanın altı hiç açılmaz", async () => {
    await seedCatalog();
    for (const catalog of ["full", "discovery"] as const) {
      expect((await categories().childrenOf(SAFETY_SEG, catalog)).map((c) => c.id).sort()).toEqual([PPE_FAM, FIRE_FAM].sort());
      expect((await categories().childrenOf(PPE_FAM, catalog)).map((c) => c.id)).toEqual([PPE_CLS]);
      expect(await categories().childrenOf(WEAPON_FAM, catalog)).toEqual([]);
      expect(await categories().childrenOf(SPRAY_CLS, catalog)).toEqual([]);
    }
  });

  it("arama önerisi (hero kutusu): gizli aile / sınıf kategori olarak önerilmez; 46'nın görünür dalları önerilir", async () => {
    await seedCatalog();
    // Gizli aile (4610), onun sınıfı, görünür ailenin gizli sınıfı (461825) ve yaprağı.
    for (const q of ["silah", "atesli", "savunma", "biber"]) {
      const res = await market().suggest(q);
      expect(res.categories).toEqual([]);
      expectNoHiddenCategory(res);
    }
    const ppe = await market().suggest("koruyucu");
    expect(ppe.categories.map((c) => c.id).sort()).toEqual([PPE_FAM, PPE_CLS].sort());
    const fire = await market().suggest("yangin");
    expect(fire.categories.map((c) => c.id).sort()).toEqual([FIRE_FAM, FIRE_CLS].sort());
    expectNoHiddenCategory([ppe, fire]);
  });
});

describe("46 altındaki TALEP — gizli dalda saklanmış talep 46'nın altında listelenmez / sayılmaz", () => {
  async function seedRequests() {
    await seedCatalog();
    await seedListing([WEAPON_CLS], "Eski silah talebi");
    await seedListing([SPRAY_LEAF], "Eski sprey talebi");
    await seedListing([PPE_CLS], "Is elbisesi talebi");
    await seedListing([WEAPON_CLS, FIRE_CLS], "Karma yangin talebi");
    await seedListing([CLS], "Pano talebi");
  }
  const titles = async (category?: string) => (await market().list({ category })).items.map((i) => i.title).sort();

  it("?category=46000000 yalnız görünür kodu olan talepleri getirir; kartta gizli kod / ad yok", async () => {
    await seedRequests();
    expect(await titles()).toHaveLength(5); // eski kayıtlar yayında
    expect(await titles(SAFETY_SEG)).toEqual(["Is elbisesi talebi", "Karma yangin talebi"]);
    // 4618 ailesi: gizli sınıfındaki (461825) talep ailenin altında da yok.
    expect(await titles(PPE_FAM)).toEqual(["Is elbisesi talebi"]);
    expect(await titles(PPE_CLS)).toEqual(["Is elbisesi talebi"]);
    expect(await titles(FIRE_FAM)).toEqual(["Karma yangin talebi"]);

    const list = await market().list({ category: SAFETY_SEG });
    expect(list.total).toBe(2);
    expectNoHiddenCategory(list);
    const mixed = list.items.find((i) => i.title === "Karma yangin talebi");
    expect(mixed?.categories.map((c) => c.id)).toEqual([FIRE_CLS]);
  });

  it.each([
    ["gizli aile", WEAPON_FAM],
    ["gizli ailenin sınıfı", WEAPON_CLS],
    ["gizli sınıf", SPRAY_CLS],
    ["gizli sınıfın yaprağı", SPRAY_LEAF],
  ])("?category=<%s> süzgeç DEĞİL: liste ve sayaçlar kategori seçilmemiş gibi", async (_level, code) => {
    await seedRequests();
    expect((await market().list({ category: code })).total).toBe(5);
    const facets = await market().facets({ category: code });
    expect(facets.selectedCategory).toBeNull();
    expect(facets).toEqual(await market().facets({}));
    expectNoHiddenCategory(facets);
  });

  it("sayaçlar: sektör sayısı gizli daldaki talebi içermez ve tıklanınca gelen listeyle aynıdır", async () => {
    await seedRequests();
    const facets = await market().facets({});
    expect(facets.categories.map((c) => [c.id, c.count])).toEqual([
      [SAFETY_SEG, 2],
      [SEG, 1],
    ]);
    expect(facets.categories[0]?.name).toBe(SAFETY_SEG_NAME);

    const picked = await market().facets({ category: SAFETY_SEG });
    expect(picked.selectedCategory).toEqual({ id: SAFETY_SEG, name: SAFETY_SEG_NAME, level: 1 });
    // Diğer boyutlar seçili kategorinin GÖRÜNÜR alt ağacı üzerinden sayılır.
    expect(picked.buyerCountries).toEqual([{ code: "TR", count: 2 }]);
    expect(picked.openToAll).toBe(2);
    expect((await market().facets({ category: PPE_FAM })).openToAll).toBe(1);
    expectNoHiddenCategory(picked);
  });
});

describe("46 altındaki ÜRÜN — gizli dalda saklanmış ürün 46'nın altında listelenmez / sayılmaz", () => {
  async function seedProducts() {
    await seedCatalog();
    const weapon = await seedProduct(WEAPON_CLS, "Eski tufek");
    const spray = await seedProduct(SPRAY_LEAF, "Eski biber spreyi");
    const ppe = await seedProduct(PPE_CLS, "Is elbisesi");
    const fire = await seedProduct(FIRE_CLS, "Yangin tupu");
    const panel = await seedProduct(CLS, "Dagitim panosu");
    return { weapon, spray, ppe, fire, panel };
  }
  const names = async (category?: string) => (await market().listProducts({ category })).items.map((i) => i.name).sort();

  it("ürün dizini: ?category=46000000 / 46180000 gizli dalın ürününü getirmez; ürünün kendisi dizinde kategorisiz durur", async () => {
    await seedProducts();
    const all = await market().listProducts({});
    expect(all.total).toBe(5);
    const byName = new Map(all.items.map((i) => [i.name, i]));
    expect(byName.get("Eski tufek")?.categoryId).toBeNull();
    expect(byName.get("Eski biber spreyi")?.categoryId).toBeNull();
    expect(byName.get("Is elbisesi")?.categoryId).toBe(PPE_CLS);
    expectNoHiddenCategory(all);

    expect(await names(SAFETY_SEG)).toEqual(["Is elbisesi", "Yangin tupu"]);
    expect((await market().listProducts({ category: SAFETY_SEG })).total).toBe(2);
    expect(await names(PPE_FAM)).toEqual(["Is elbisesi"]);
    expect(await names(PPE_CLS)).toEqual(["Is elbisesi"]);
    // Gizli kod süzgeç değildir.
    for (const code of [WEAPON_FAM, WEAPON_CLS, SPRAY_CLS, SPRAY_LEAF]) {
      expect((await market().listProducts({ category: code })).total).toBe(5);
    }
  });

  it("ürün sayaçları: sektör sayısı, alt dal kırılımı ve seçili kategorinin diğer boyutları gizli dalı içermez", async () => {
    await seedProducts();
    const none = await market().productFacets({});
    expect(none.categories.map((c) => [c.id, c.count])).toEqual([
      [SAFETY_SEG, 2],
      [SEG, 1],
    ]);

    const seg = await market().productFacets({ category: SAFETY_SEG });
    expect(seg.selectedCategory).toEqual(expect.objectContaining({ id: SAFETY_SEG, name: SAFETY_SEG_NAME }));
    // Alt dallar: yalnız görünür aileler; 4618'in sayısında 461825 ürünü yok.
    expect(seg.subCategories.map((c) => [c.id, c.count]).sort()).toEqual(
      [
        [PPE_FAM, 1],
        [FIRE_FAM, 1],
      ].sort(),
    );
    // Seçili kategorinin bağlamsal sayaçları listeyle aynı kümeden (2 ürün).
    expect(seg.price.has + seg.price.request).toBe(2);
    expectNoHiddenCategory(seg);

    const fam = await market().productFacets({ category: PPE_FAM });
    expect(fam.subCategories.map((c) => [c.id, c.count])).toEqual([[PPE_CLS, 1]]);
    expect(fam.price.has + fam.price.request).toBe(1);
    expectNoHiddenCategory(fam);

    for (const code of [WEAPON_FAM, SPRAY_CLS, SPRAY_LEAF]) {
      const hidden = await market().productFacets({ category: code });
      expect(hidden).toEqual(none);
    }
  });

  it("gizli dalın nitelik tanımı süzgeç olarak sunulmaz; görünür kodun niteliği sunulur", async () => {
    await seedProducts();
    await prisma.categoryAttribute.create({
      data: { categoryId: WEAPON_FAM, groupKey: "kalibre", nameTr: "Kalibre Gizli", type: "SINGLE_SELECT", options: ["9mm"], sortOrder: 0 },
    });
    await prisma.categoryAttribute.create({
      data: { categoryId: SAFETY_SEG, groupKey: "beden", nameTr: "Beden", type: "SINGLE_SELECT", options: ["XL", "L"], sortOrder: 0 },
    });
    expect((await market().productFacets({ category: WEAPON_FAM })).attributes).toEqual([]);
    expect((await market().productFacets({ category: WEAPON_CLS })).attributes).toEqual([]);
    const visible = await market().productFacets({ category: PPE_CLS });
    expect(visible.attributes.map((a) => a.key)).toEqual(["beden"]);
    expect(JSON.stringify(visible)).not.toContain("Kalibre Gizli");
  });

  it("mega menü: 46'nın sayısı ve aile listesi gizli dalı içermez", async () => {
    await seedProducts();
    const menu = await market().categoryMenu();
    const safety = menu.find((m) => m.id === SAFETY_SEG);
    expect(safety?.name).toBe(SAFETY_SEG_NAME);
    expect(safety?.count).toBe(2);
    expect(safety?.children.map((c) => [c.id, c.count]).sort()).toEqual(
      [
        [PPE_FAM, 1],
        [FIRE_FAM, 1],
      ].sort(),
    );
    expect(menu.map((m) => m.id)).not.toContain(HIDDEN_SEG);
    expectNoHiddenCategory(menu);
  });

  it("anasayfa sayıları: ürünlü kategori sayısı ve popüler kategoriler gizli dalı içermez", async () => {
    await seedProducts();
    // Gizli sınıfta İKİNCİ ürün: en kalabalık sınıf gizli olan olsun.
    await seedProduct(WEAPON_CLS, "Eski tabanca");
    const stats = await market().stats();
    expect(stats.products).toBe(6); // ürünler sayılır, yalnız kategorileri görünmez
    expect(stats.categories).toBe(2); // 46 ve 39
    expect(stats.popularCategories.map((c) => c.id).sort()).toEqual([CLS, PPE_CLS, FIRE_CLS].sort());
    expectNoHiddenCategory(stats);
  });

  it("sitemap özeti: 46 segmentinin sayısı ve lastmod'u gizli daldaki üründen etkilenmez", async () => {
    const { weapon, ppe, fire } = await seedProducts();
    // Gizli daldaki ürün EN SON güncellenen olsun: lastmod'u ilerletmemeli.
    const later = new Date(Date.now() + 86_400_000);
    await prisma.$executeRaw`UPDATE company_items SET "updatedAt" = ${later} WHERE id = ${weapon.product.id}`;
    const rows = await prisma.companyItem.findMany({
      where: { id: { in: [ppe.product.id, fire.product.id] } },
      select: { updatedAt: true },
    });
    const newestVisible = new Date(Math.max(...rows.map((r) => r.updatedAt.getTime()))).toISOString();

    const summary = await sitemap().summary();
    expect(summary.products.count).toBe(5); // ürün sayfaları sitemap'te
    const safety = summary.categories.find((c) => c.id === SAFETY_SEG);
    expect(safety?.count).toBe(2);
    expect(safety?.lastmod).toBe(newestVisible);
    expect(summary.categories.map((c) => c.id).sort()).toEqual([SAFETY_SEG, SEG].sort());
  });

  it("ilişkili bloklar: görünür ürünün 'benzer' / 'kategoride yeni' satırına gizli dalın ürünü girmez", async () => {
    const { ppe } = await seedProducts();
    const rel = await market().relatedProducts(ppe.company.slug as string, ppe.product.slug as string);
    // Sınıf ve aile düzeyinde başka firma ürünü yok → segment 46'ya çıkar; orada yalnız görünür dal.
    expect(rel.similar.map((c) => c.name)).toEqual(["Yangin tupu"]);
    expect(rel.popular.map((c) => c.name)).toEqual(["Yangin tupu"]);
    expectNoHiddenCategory(rel);
  });

  it("ilişkili bloklar: gizli daldaki eski ürünün blokları kendi ham kodundan çalışmaya devam eder", async () => {
    const { weapon } = await seedProducts();
    await seedProduct(WEAPON_CLS, "Eski tabanca");
    const rel = await market().relatedProducts(weapon.company.slug as string, weapon.product.slug as string);
    expect(rel.similar.map((c) => c.name)).toContain("Eski tabanca");
    expect(rel.similar.find((c) => c.name === "Eski tabanca")?.categoryId).toBeNull();
    expectNoHiddenCategory(rel);
  });

  it("ürün sayfası: gizli daldaki ürün kategorisiz ve SEGMENT HALKASIZ açılır; 46181500 sıradan kategoridir", async () => {
    const { weapon, spray, ppe } = await seedProducts();
    for (const legacy of [weapon, spray]) {
      const res = await profiles().getPublicProduct(legacy.company.slug as string, legacy.product.slug as string);
      expect(res.product.name).toBe(legacy.product.name);
      expect(res.product.category).toBeNull();
      expect(res.product.categoryId).toBeNull();
      // Segment 46 görünür ama ürün onun altında listelenmez → kırıntı oraya bağlanmaz.
      expect(res.product.segment).toBeNull();
      expectNoHiddenCategory(res);
      expect(JSON.stringify(res)).not.toContain(SAFETY_SEG_NAME);
    }
    const ok = await profiles().getPublicProduct(ppe.company.slug as string, ppe.product.slug as string);
    expect(ok.product.category).toEqual({ id: PPE_CLS, name: PPE_CLS_NAME });
    expect(ok.product.categoryId).toBe(PPE_CLS);
    expect(ok.product.segment).toEqual(expect.objectContaining({ id: SAFETY_SEG, name: SAFETY_SEG_NAME }));
  });

  it("firma vitrini: ?categoryId=46000000 gizli daldaki ürünü getirmez", async () => {
    await seedCatalog();
    const { company, user } = await seedCompany();
    for (const [categoryId, name, slug] of [
      [WEAPON_CLS, "Eski tufek", "vitrin-tufek"],
      [SPRAY_LEAF, "Eski biber spreyi", "vitrin-sprey"],
      [PPE_CLS, "Is elbisesi", "vitrin-elbise"],
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
    const shelf = async (categoryId?: string) =>
      (await profiles().listPublicProducts(companySlug, { categoryId })).items.map((i) => i.name).sort();
    expect(await shelf()).toHaveLength(4);
    expect(await shelf(SAFETY_SEG)).toEqual(["Is elbisesi"]);
    expect(await shelf(PPE_FAM)).toEqual(["Is elbisesi"]);
    expect(await shelf(WEAPON_FAM)).toHaveLength(4);
    expect(await shelf(SPRAY_CLS)).toHaveLength(4);
    // Arama ile birlikte de aynı kural.
    expect((await profiles().listPublicProducts(companySlug, { categoryId: SAFETY_SEG, q: "eski" })).total).toBe(0);
    expect((await profiles().listPublicProducts(companySlug, { categoryId: SAFETY_SEG, q: "elbisesi" })).total).toBe(1);
  });
});

describe("46 altındaki FİRMA BEYANI — yalnız gizli seçimi olan firma 46'nın altında listelenmez / sayılmaz", () => {
  /**
   * Beyan seçimi ata zinciriyle saklar: gizli `46101500` seçmiş firmanın
   * kaydında görünür `46000000` da durur. Dört firma, hepsi yayında ürünlü
   * (dizinde listelenme koşulu):
   *   Silah   — yalnız gizli AİLE seçimi        → 46 altında YOK
   *   Sprey   — yalnız gizli SINIF seçimi       → 46 ve 4618 altında YOK
   *   Koruyucu— görünür sınıf seçimi            → 46 ve 4618 altında VAR
   *   Sektor  — segmentin tamamı (alt seçim yok)→ 46 altında VAR
   */
  async function seedDeclarations() {
    await seedCatalog();
    const weapon = await seedProduct(CLS, "Pano A", {
      name: "Silah Beyan AS",
      sellerCategoryIds: [SAFETY_SEG],
      sellerSubCategoryIds: [WEAPON_FAM, WEAPON_CLS],
    });
    const spray = await seedProduct(CLS, "Pano B", {
      name: "Sprey Beyan AS",
      buyerCategoryIds: [SAFETY_SEG],
      buyerSubCategoryIds: [PPE_FAM, SPRAY_CLS, SPRAY_LEAF],
    });
    const ppe = await seedProduct(CLS, "Pano C", {
      name: "Koruyucu Beyan AS",
      sellerCategoryIds: [SAFETY_SEG],
      sellerSubCategoryIds: [PPE_FAM, PPE_CLS, WEAPON_FAM, WEAPON_CLS],
    });
    const whole = await seedProduct(CLS, "Pano D", { name: "Sektor Geneli AS", sellerCategoryIds: [SAFETY_SEG] });
    return { weapon, spray, ppe, whole };
  }
  const listed = async (category?: string) => (await buildDirectory(prisma, { category })).items.map((i) => i.name).sort();

  it("dizin süzgeci ve kartı: gösterilen beyan karar verir", async () => {
    await seedDeclarations();
    expect(await listed()).toHaveLength(4); // firmalar dizinde durur
    expect(await listed(SAFETY_SEG)).toEqual(["Koruyucu Beyan AS", "Sektor Geneli AS"]);
    expect(await listed(PPE_FAM)).toEqual(["Koruyucu Beyan AS"]);
    expect(await listed(PPE_CLS)).toEqual(["Koruyucu Beyan AS"]);
    // Gizli kod süzgeç değildir.
    expect(await listed(WEAPON_FAM)).toHaveLength(4);
    expect(await listed(SPRAY_LEAF)).toHaveLength(4);

    const res = await buildDirectory(prisma, {});
    const byName = new Map(res.items.map((i) => [i.name, i]));
    expect(byName.get("Silah Beyan AS")?.mainCategory).toBeNull();
    expect(byName.get("Sprey Beyan AS")?.mainCategory).toBeNull();
    expect(byName.get("Koruyucu Beyan AS")?.mainCategory).toEqual({ id: SAFETY_SEG, name: SAFETY_SEG_NAME });
    expect(byName.get("Sektor Geneli AS")?.mainCategory).toEqual({ id: SAFETY_SEG, name: SAFETY_SEG_NAME });
    expectNoHiddenCategory(res);

    const pub = await profiles().publicDirectory({ category: SAFETY_SEG });
    expect(pub.items.map((i) => i.name).sort()).toEqual(["Koruyucu Beyan AS", "Sektor Geneli AS"]);
    expect(pub.total).toBe(2);
  });

  it("dizin sayaçları: 46'nın sayısı listeyle aynı; seçiliyken toplam da", async () => {
    await seedDeclarations();
    const none = await directoryFacets(prisma, {}, {});
    expect(none.total).toBe(4);
    expect(none.categories).toEqual([{ id: SAFETY_SEG, name: SAFETY_SEG_NAME, count: 2 }]);
    expect((await directoryFacets(prisma, {}, { category: SAFETY_SEG })).total).toBe(2);
    expect((await directoryFacets(prisma, {}, { category: PPE_FAM })).total).toBe(1);
    expect(await directoryFacets(prisma, {}, { category: WEAPON_CLS })).toEqual(none);
    expectNoHiddenCategory(none);
  });

  it("herkese açık profil ve dizin özeti: yalnız gizli seçimin atası olan segment kategori olarak basılmaz / sayılmaz", async () => {
    const { weapon, spray, ppe, whole } = await seedDeclarations();
    expect((await profiles().getBySlug(weapon.company.slug as string)).categories).toEqual([]);
    expect((await profiles().getBySlug(spray.company.slug as string)).categories).toEqual([]);
    for (const shown of [ppe, whole]) {
      const res = await profiles().getBySlug(shown.company.slug as string);
      expect(res.categories).toEqual([{ id: SAFETY_SEG, name: SAFETY_SEG_NAME }]);
      expectNoHiddenCategory(res);
      // Alt eksen dizileri yalnız karar için okunur; yanıta yazılmaz.
      expect(res).not.toHaveProperty("sellerSubCategoryIds");
      expect(res).not.toHaveProperty("buyerSubCategoryIds");
    }
    const summary = await profiles().directorySummary();
    expect(summary.topCategories).toEqual([{ id: SAFETY_SEG, name: SAFETY_SEG_NAME, count: 2 }]);

    // Kayıt değişmedi: beyan eşleştirme için yerinde.
    const stored = await prisma.company.findUniqueOrThrow({ where: { id: weapon.company.id } });
    expect(stored.sellerCategoryIds).toEqual([SAFETY_SEG]);
    expect(stored.sellerSubCategoryIds).toEqual([WEAPON_FAM, WEAPON_CLS]);
  });
});
