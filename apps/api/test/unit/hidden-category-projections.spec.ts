import { Prisma } from "@rothern/db";
import {
  toPublicListingCard,
  toPublicListingDetail,
  type PublicCategoryMap,
  type PublicListingRow,
} from "../../src/modules/public-marketplace/dto/public-listing.projection";
import {
  toProductIndexCard,
  type ProductIndexRow,
} from "../../src/modules/public-marketplace/dto/public-product-index.projection";
import {
  toPublicProduct,
  toPublicProductCard,
  type PublicProductRow,
} from "../../src/modules/public-profile/dto/public-product.projection";
import {
  attributeFacets,
  contextualFacetCounts,
  productCategoryWhere,
  productIndexWhere,
  productSubtreeClauses,
  subCategoryCounts,
  type ProductFacetRow,
} from "../../src/common/company/product-index";

/**
 * GİZLİ DAL — YANSITMALAR ve SAF SÜZGEÇ MANTIĞI (2026-10-09, sahip kuralı:
 * "anasayfada olmayan kategori talepte, üründe ya da başka yerde de
 * gösterilmesin"). DB'ye dokunmaz; gerçek sorgulu karşılığı
 * `integration/hidden-category-public-surfaces.spec.ts`.
 *
 * 2026-10-10: gizlemenin birimi KOD ÖNEKİ. 46 "İş Güvenliği ve Yangın
 * Ekipmanları" adıyla görünür; altında yalnız silah / kolluk dalları gizli.
 * Fikstürler üç düzeyi de taşır:
 *   HIDDEN       — gizli AİLE (4610) altındaki sınıf,
 *   HIDDEN_CLASS — görünür ailenin (4618) gizli SINIFI (461825) altındaki yaprak,
 *   LEGACY       — tümüyle gizli SEGMENT (10),
 *   SAFETY       — 46 altındaki GÖRÜNÜR sınıf (sıradan kategori gibi davranır).
 */
const HIDDEN = "46101500";
const HIDDEN_CLASS = "46182501";
const LEGACY = "10101500";
const VISIBLE = "39121000";
const SAFETY = "46181500";

function listingRow(categoryIds: string[]): PublicListingRow {
  return {
    id: "l1",
    number: "ROT-000042",
    type: "ALIM",
    title: "Eski talep",
    description: null,
    status: "OPEN",
    format: "RFQ",
    primaryCurrency: "TRY",
    allowedCurrencies: ["TRY"],
    isInternational: false,
    targetCountries: [],
    categoryIds,
    preferredActivities: [],
    keywords: [],
    requireAllItems: false,
    requireBidDocument: false,
    requireGuaranteeLetter: false,
    isSealedBid: true,
    isLogistics: false,
    deliveryTerm: null,
    paymentCategory: "OPEN",
    paymentTiming: "ON_DELIVERY",
    advancePercent: null,
    paymentDays: null,
    lcType: null,
    lcConfirmed: false,
    closesAt: null,
    publishedAt: new Date("2026-09-01T10:00:00Z"),
    updatedAt: new Date("2026-09-01T10:00:00Z"),
    publicIndexable: true,
    coverImageUrl: null,
    items: [{ lineNo: 1, name: "Kalem", images: [], quantity: new Prisma.Decimal(1), unit: "adet" }],
    company: { id: "c1", country: "TR", industry: null, activities: [], companyVerificationStatus: "VERIFIED" },
  } as unknown as PublicListingRow;
}

/**
 * Harita gizli kodu da TAŞIYOR — panelin maskeli satırı kendi haritasını kurar
 * (`publicCategoryMap`); yansıtma haritaya güvenmez, kodu kendisi süzer.
 */
const UNFILTERED_MAP: PublicCategoryMap = new Map([
  [HIDDEN, { id: HIDDEN, name: "Atesli Silahlar", level: 3 }],
  [HIDDEN_CLASS, { id: HIDDEN_CLASS, name: "Biber Gazi", level: 4 }],
  [LEGACY, { id: LEGACY, name: "Canli Hayvanlar", level: 3 }],
  [VISIBLE, { id: VISIBLE, name: "Dagitim Panolari", level: 3 }],
  [SAFETY, { id: SAFETY, name: "Koruyucu Giysiler", level: 3 }],
]);
const HIDDEN_LEAK = /46101500|46182501|10101500|Silahlar|Biber|Hayvanlar/;

describe("herkese açık talep yansıtması — gizli dal (segment, aile, sınıf)", () => {
  it("kart: harita gizli kodu çözse bile kategori listesine girmez (maskeli panel satırı aynı fonksiyon)", () => {
    const card = toPublicListingCard(listingRow([HIDDEN, VISIBLE, LEGACY, HIDDEN_CLASS]), UNFILTERED_MAP);
    expect(card.categories).toEqual([{ id: VISIBLE, name: "Dagitim Panolari", level: 3 }]);
    expect(JSON.stringify(card)).not.toMatch(HIDDEN_LEAK);
  });

  it("detay: ad listesi ve ham `categoryIds` yalnız görünür kodlar; sıra korunur", () => {
    const detail = toPublicListingDetail(listingRow([HIDDEN, VISIBLE, LEGACY, HIDDEN_CLASS, "31000000"]), UNFILTERED_MAP);
    expect(detail.categories.map((c) => c.id)).toEqual([VISIBLE]);
    expect(detail.categoryIds).toEqual([VISIBLE, "31000000"]);
    expect(JSON.stringify(detail)).not.toMatch(HIDDEN_LEAK);
  });

  it.each([
    ["gizli aile", HIDDEN],
    ["gizli sınıf", HIDDEN_CLASS],
    ["gizli segment", LEGACY],
  ])("yalnız %s kategorili eski talep: kayıt yansır, kategorisi boş", (_level, code) => {
    const detail = toPublicListingDetail(listingRow([code]), UNFILTERED_MAP);
    expect(detail.title).toBe("Eski talep");
    expect(detail.categories).toEqual([]);
    expect(detail.categoryIds).toEqual([]);
  });

  it("46 altındaki görünür sınıf sıradan kategoridir: kartta ve detayda adıyla çıkar", () => {
    const card = toPublicListingCard(listingRow([SAFETY, HIDDEN]), UNFILTERED_MAP);
    expect(card.categories).toEqual([{ id: SAFETY, name: "Koruyucu Giysiler", level: 3 }]);
    const detail = toPublicListingDetail(listingRow([SAFETY, HIDDEN]), UNFILTERED_MAP);
    expect(detail.categoryIds).toEqual([SAFETY]);
  });
});

function productRow(categoryId: string | null): PublicProductRow {
  return {
    id: "p1",
    slug: "urun",
    name: "Ürün",
    description: null,
    specification: null,
    brand: null,
    mpn: null,
    unit: "adet",
    unitCode: null,
    categoryId,
    images: [],
    priceAmount: null,
    priceTiers: null,
    priceCurrency: "TRY",
    moq: null,
    videoUrl: null,
    externalUrl: null,
    documents: null,
    keywords: [],
    attributes: null,
    priceMode: "ON_REQUEST",
    publishedAt: null,
    updatedAt: new Date("2026-09-01T10:00:00Z"),
    company: { tier: "GOLD", membershipEndAt: null, companyVerificationStatus: "VERIFIED" },
  } as unknown as PublicProductRow;
}

function indexRow(categoryId: string | null): ProductIndexRow {
  return {
    id: "p1",
    slug: "urun",
    attributes: null,
    name: "Ürün",
    description: null,
    images: [],
    unit: "adet",
    categoryId,
    priceMode: "ON_REQUEST",
    priceAmount: null,
    priceTiers: null,
    priceCurrency: "TRY",
    moq: null,
    publishedAt: null,
    completionScore: 0,
    company: {
      name: "Vitrin",
      slug: "vitrin",
      city: null,
      country: "TR",
      industry: null,
      activities: [],
      logoUrl: null,
      tier: "GOLD",
      membershipEndAt: null,
      companyVerificationStatus: "VERIFIED",
    },
  } as unknown as ProductIndexRow;
}

describe("ürün yansıtmaları — gizli dalın kodu yanıta yazılmaz", () => {
  it.each([HIDDEN, HIDDEN_CLASS, LEGACY])("%s → categoryId null (detay, firma vitrini kartı, dizin kartı)", (code) => {
    expect(toPublicProduct(productRow(code)).categoryId).toBeNull();
    expect(toPublicProduct(productRow(code), { anonymous: true }).categoryId).toBeNull();
    expect(toPublicProductCard(productRow(code)).categoryId).toBeNull();
    expect(toProductIndexCard(indexRow(code)).categoryId).toBeNull();
  });

  it.each([VISIBLE, SAFETY, "46000000"])("görünür kod %s değişmeden yansır", (code) => {
    expect(toPublicProduct(productRow(code)).categoryId).toBe(code);
    expect(toPublicProductCard(productRow(code)).categoryId).toBe(code);
    expect(toProductIndexCard(indexRow(code)).categoryId).toBe(code);
  });

  it("kategorisiz ürün değişmez", () => {
    expect(toPublicProduct(productRow(null)).categoryId).toBeNull();
    expect(toProductIndexCard(indexRow(null)).categoryId).toBeNull();
  });
});

describe("ürün dizini süzgeci — gizli dalın kodu süzgeç değildir, görünür kodun gizli torunu listelenmez", () => {
  /** `productIndexWhere` kategori koşulunu `AND` dizisinin başına koyar. */
  const categoryClause = (category?: string) =>
    (productIndexWhere({ category }).AND as unknown[] | undefined)?.find((c) => "categoryId" in (c as object));

  it.each([HIDDEN, HIDDEN_CLASS, LEGACY, "46100000", "46182500", "10000000"])(
    "productIndexWhere: gizli kod %s kategori seçilmemiş gibi davranır",
    (code) => {
      expect(productIndexWhere({ category: code })).toEqual(productIndexWhere({}));
    },
  );

  it("productIndexWhere: gizli torunu olmayan görünür kodda koşul yalnız alt ağaç önekidir", () => {
    expect(categoryClause("39000000")).toEqual({ categoryId: { startsWith: "39" } });
    expect(categoryClause(SAFETY)).toEqual({ categoryId: { startsWith: "461815" } });
    // Koşul `where`in üstüne YAYILMAZ: `NOT` taşıyabildiği için `AND` öğesidir.
    expect(productIndexWhere({ category: "39000000" })).not.toHaveProperty("categoryId");
  });

  it("productIndexWhere: 46000000 alt ağacı gizli aileler ve gizli sınıf OLMADAN süzer", () => {
    const clause = categoryClause("46000000") as { categoryId: unknown; NOT: { categoryId: { startsWith: string } }[] };
    expect(clause.categoryId).toEqual({ startsWith: "46" });
    expect(clause.NOT.map((c) => c.categoryId.startsWith).sort()).toEqual(
      ["4610", "4611", "4612", "4613", "4614", "4615", "461825", "4620", "4622"],
    );
    expect(productIndexWhere({ category: "46000000" })).not.toHaveProperty("NOT");
  });

  it("productIndexWhere: 46180000 ailesi gizli sınıfı (461825) dışarıda bırakır", () => {
    expect(categoryClause("46180000")).toEqual({
      categoryId: { startsWith: "4618" },
      NOT: [{ categoryId: { startsWith: "461825" } }],
    });
  });

  it("productSubtreeClauses: gizli KÖK ham alt ağaçtır (ilişkili bloklar eski ürünün kendi kodundan yukarı çıkar)", () => {
    expect(productSubtreeClauses("46100000")).toEqual([{ categoryId: { startsWith: "4610" } }]);
    expect(productSubtreeClauses("10000000")).toEqual([{ categoryId: { startsWith: "10" } }]);
    // Görünür köke çıkınca gizli torunlar düşer.
    expect(productSubtreeClauses("46000000")[0]).toHaveProperty("NOT");
    // Kod değilse / yoksa süzgeç yok.
    expect(productSubtreeClauses(null)).toEqual([]);
    expect(productSubtreeClauses("46")).toEqual([]);
    expect(productSubtreeClauses("abc")).toEqual([]);
  });

  it("productCategoryWhere HAM kalır — yalnız eşleştirme okur (saklanan kodların tamamı)", () => {
    expect(productCategoryWhere(HIDDEN)).toEqual({ categoryId: { startsWith: "461015" } });
    expect(productCategoryWhere("46000000")).toEqual({ categoryId: { startsWith: "46" } });
    expect(productCategoryWhere("46180000")).toEqual({ categoryId: { startsWith: "4618" } });
  });

  it("subCategoryCounts: gizli dalın kodu verilirse alt kırılım sunulmaz", () => {
    const rows = [{ categoryId: HIDDEN }, { categoryId: "46101600" }, { categoryId: HIDDEN_CLASS }, { categoryId: LEGACY }];
    expect(subCategoryCounts(rows, "46100000")).toEqual([]);
    expect(subCategoryCounts(rows, "46182500")).toEqual([]);
    expect(subCategoryCounts(rows, "10000000")).toEqual([]);
  });

  it("subCategoryCounts: görünür kodun GİZLİ alt dalı ne listelenir ne sayılır (çağıran süzülmemiş satır verse de)", () => {
    const rows = [
      { categoryId: HIDDEN }, // 4610 — gizli aile
      { categoryId: "46151600" }, // 4615 — gizli aile
      { categoryId: HIDDEN_CLASS }, // 461825 — gizli sınıf
      { categoryId: SAFETY }, // 461815 — görünür
      { categoryId: "46181700" }, // 461817 — görünür
      { categoryId: "46191600" }, // 4619 — görünür
      { categoryId: VISIBLE },
    ];
    expect(subCategoryCounts(rows, "46000000")).toEqual([
      ["46180000", 2],
      ["46190000", 1],
    ]);
    expect(subCategoryCounts(rows, "46180000")).toEqual([
      [SAFETY, 1],
      ["46181700", 1],
    ]);
    // Görünür segment eskisi gibi bir alt seviyeye yuvarlar.
    expect(subCategoryCounts(rows, "39000000")).toEqual([["39120000", 1]]);
  });

  it("sektör sayacı: gizli daldaki ürün görünür segmentine YUVARLANMAZ", () => {
    const row = (categoryId: string): ProductFacetRow => ({
      categoryId,
      priceMode: "ON_REQUEST",
      company: { city: null, activities: [] },
    });
    const counts = contextualFacetCounts([HIDDEN, HIDDEN_CLASS, "46151600", SAFETY, LEGACY, VISIBLE].map(row), {});
    expect(new Map(counts.categories)).toEqual(
      new Map([
        ["46000000", 1],
        ["39000000", 1],
      ]),
    );
  });

  it.each([HIDDEN, HIDDEN_CLASS, LEGACY])(
    "attributeFacets: gizli kod %s için nitelik süzgeci sunulmaz (tanım sorgusu bile atılmaz)",
    async (code) => {
      const findMany = jest.fn().mockResolvedValue([
        {
          categoryId: "46000000",
          groupKey: "beden",
          nameTr: "Beden",
          type: "SINGLE_SELECT",
          options: ["XL"],
          unit: null,
          isRequired: false,
        },
      ]);
      const prisma = { categoryAttribute: { findMany } } as never;
      expect(await attributeFacets(prisma, code, [{ attributes: { beden: "XL" } }])).toEqual([]);
      expect(findMany).not.toHaveBeenCalled();
    },
  );

  it("attributeFacets: 46 altındaki görünür kodda nitelik süzgeci sıradan kategori gibi çalışır", async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        categoryId: "46000000",
        groupKey: "beden",
        nameTr: "Beden",
        type: "SINGLE_SELECT",
        options: ["XL"],
        unit: null,
        isRequired: false,
        sortOrder: 0,
      },
    ]);
    const prisma = { categoryAttribute: { findMany } } as never;
    const facets = await attributeFacets(prisma, SAFETY, [{ attributes: { beden: "XL" } }]);
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(facets.map((f) => f.key)).toEqual(["beden"]);
  });
});
