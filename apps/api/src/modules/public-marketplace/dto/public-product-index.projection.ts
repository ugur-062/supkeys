import { Prisma } from "@rothern/db";

/**
 * FİRMALAR-ARASI ÜRÜN DİZİNİ — kart yansıtması (beyaz liste).
 *
 * `public-profile/dto/public-product.projection.ts` firmanın KENDİ vitrinini
 * yansıtır; orada firma zaten bellidir (URL firmanın altında). Dizin kartı
 * farklı: aynı listede farklı firmaların ürünleri yan yana durur, bu yüzden
 * kart firmayı da TAŞIMALIDIR — hangi ürünün kimden geldiğini göstermeyen bir
 * dizin, tıklamadan önce karar verilemez bir dizindir.
 *
 * ── İLAN KARTIYLA KASITLI ZITLIK ──────────────────────────────────────────
 * `PUBLIC_LISTING_SELECT` firma adını HİÇ çekmez (ilan = işlem → anonim).
 * Burada tam tersi: ürün = vitrin → firma adıyla, opt-in (`publicEnabled`) ve
 * satılan bir özellik (BRONZ+). İki kart yan yana durduğu için ayrım
 * sözleşme testiyle kilitlenir (`public-product-index.spec.ts`).
 *
 * Dışarıda kalanlar `public-product.projection.ts` ile aynı gerekçelerle:
 * `code` (envanter yapısı), `targetPrice` (ALIŞ hedefi = maliyet),
 * `completionScore` (iç kalite ölçütü), cuid `id` — ve fiyat/MOQ: anonim
 * ziyaretçiye fiyat DÖNMEZ (gerekçe `public-product.projection.ts`).
 */
export const PRODUCT_INDEX_SELECT = {
  slug: true,
  name: true,
  description: true,
  images: true,
  unit: true,
  categoryId: true,
  priceMode: true,
  publishedAt: true,
  company: {
    select: {
      name: true,
      slug: true,
      city: true,
      country: true,
      industry: true,
    },
  },
} satisfies Prisma.CompanyItemSelect;

export type ProductIndexRow = Prisma.CompanyItemGetPayload<{
  select: typeof PRODUCT_INDEX_SELECT;
}>;

export interface ProductIndexCard {
  slug: string;
  name: string;
  excerpt: string | null;
  images: string[];
  unit: string;
  categoryId: string | null;
  priceMode: string;
  company: {
    name: string;
    slug: string;
    city: string | null;
    country: string | null;
  };
}

export function toProductIndexCard(r: ProductIndexRow): ProductIndexCard {
  const flat = (r.description ?? "").replace(/\s+/g, " ").trim();
  return {
    slug: r.slug ?? "",
    name: r.name,
    excerpt: flat ? (flat.length <= 160 ? flat : `${flat.slice(0, 159)}…`) : null,
    images: r.images,
    unit: r.unit,
    categoryId: r.categoryId,
    priceMode: r.priceMode,
    company: {
      // Kapı (`publicProductWhere`) slug'sız firmayı zaten eliyor; boş dize
      // yalnız tip daraltması için.
      name: r.company.name,
      slug: r.company.slug ?? "",
      city: r.company.city,
      country: r.company.country,
    },
  };
}
