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
  productCategoryWhere,
  productIndexWhere,
  subCategoryCounts,
} from "../../src/common/company/product-index";

/**
 * GİZLİ SEGMENT — YANSITMALAR ve SAF SÜZGEÇ MANTIĞI (2026-10-09, sahip kuralı:
 * "anasayfada olmayan kategori talepte, üründe ya da başka yerde de
 * gösterilmesin"). DB'ye dokunmaz; gerçek sorgulu karşılığı
 * `integration/hidden-category-public-surfaces.spec.ts`.
 *
 * Fikstür ESKİ KAYIT: 46 (2026-10-09'da gizlendi) ve 10 (eski gizli) kodları.
 */
const HIDDEN = "46181500";
const LEGACY = "10101500";
const VISIBLE = "39121000";

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
  [HIDDEN, { id: HIDDEN, name: "Koruyucu Guvenlik Giysileri", level: 3 }],
  [LEGACY, { id: LEGACY, name: "Canli Hayvanlar", level: 3 }],
  [VISIBLE, { id: VISIBLE, name: "Dagitim Panolari", level: 3 }],
]);

describe("herkese açık talep yansıtması — gizli segment", () => {
  it("kart: harita gizli kodu çözse bile kategori listesine girmez (maskeli panel satırı aynı fonksiyon)", () => {
    const card = toPublicListingCard(listingRow([HIDDEN, VISIBLE, LEGACY]), UNFILTERED_MAP);
    expect(card.categories).toEqual([{ id: VISIBLE, name: "Dagitim Panolari", level: 3 }]);
    expect(JSON.stringify(card)).not.toMatch(/46181500|10101500|Guvenlik|Hayvanlar/);
  });

  it("detay: ad listesi ve ham `categoryIds` yalnız görünür kodlar; sıra korunur", () => {
    const detail = toPublicListingDetail(listingRow([HIDDEN, VISIBLE, LEGACY, "31000000"]), UNFILTERED_MAP);
    expect(detail.categories.map((c) => c.id)).toEqual([VISIBLE]);
    expect(detail.categoryIds).toEqual([VISIBLE, "31000000"]);
    expect(JSON.stringify(detail)).not.toMatch(/46181500|10101500|Guvenlik|Hayvanlar/);
  });

  it("yalnız gizli kategorili eski talep: kayıt yansır, kategorisi boş", () => {
    const detail = toPublicListingDetail(listingRow([HIDDEN]), UNFILTERED_MAP);
    expect(detail.title).toBe("Eski talep");
    expect(detail.categories).toEqual([]);
    expect(detail.categoryIds).toEqual([]);
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

describe("ürün yansıtmaları — gizli segmentin kodu yanıta yazılmaz", () => {
  it.each([HIDDEN, LEGACY])("%s → categoryId null (detay, firma vitrini kartı, dizin kartı)", (code) => {
    expect(toPublicProduct(productRow(code)).categoryId).toBeNull();
    expect(toPublicProduct(productRow(code), { anonymous: true }).categoryId).toBeNull();
    expect(toPublicProductCard(productRow(code)).categoryId).toBeNull();
    expect(toProductIndexCard(indexRow(code)).categoryId).toBeNull();
  });

  it("görünür kod ve kategorisiz ürün değişmez", () => {
    expect(toPublicProduct(productRow(VISIBLE)).categoryId).toBe(VISIBLE);
    expect(toPublicProductCard(productRow(VISIBLE)).categoryId).toBe(VISIBLE);
    expect(toProductIndexCard(indexRow(VISIBLE)).categoryId).toBe(VISIBLE);
    expect(toPublicProduct(productRow(null)).categoryId).toBeNull();
    expect(toProductIndexCard(indexRow(null)).categoryId).toBeNull();
  });
});

describe("ürün dizini süzgeci — gizli segmentin kodu süzgeç değildir", () => {
  it("productIndexWhere: gizli kodda kategori koşulu YOK, görünür kodda alt ağaç", () => {
    expect(productIndexWhere({ category: "46000000" })).not.toHaveProperty("categoryId");
    expect(productIndexWhere({ category: HIDDEN })).not.toHaveProperty("categoryId");
    expect(productIndexWhere({ category: LEGACY })).toEqual(productIndexWhere({}));
    expect(productIndexWhere({ category: "39000000" })).toMatchObject({ categoryId: { startsWith: "39" } });
  });

  it("productCategoryWhere HAM kalır — ilişkili ürün blokları eski ürünün kodundan yukarı çıkar", () => {
    expect(productCategoryWhere(HIDDEN)).toEqual({ categoryId: { startsWith: "461815" } });
    expect(productCategoryWhere("46000000")).toEqual({ categoryId: { startsWith: "46" } });
  });

  it("subCategoryCounts: gizli segmentin alt dalları sayılmaz / sunulmaz", () => {
    const rows = [{ categoryId: HIDDEN }, { categoryId: "46182000" }, { categoryId: VISIBLE }];
    expect(subCategoryCounts(rows, "46000000")).toEqual([]);
    expect(subCategoryCounts(rows, "46180000")).toEqual([]);
    // Görünür segment eskisi gibi bir alt seviyeye yuvarlar.
    expect(subCategoryCounts(rows, "39000000")).toEqual([["39120000", 1]]);
  });

  it("attributeFacets: gizli kodda nitelik süzgeci sunulmaz (tanım sorgusu bile atılmaz)", async () => {
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
    expect(await attributeFacets(prisma, HIDDEN, [{ attributes: { beden: "XL" } }])).toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });
});
