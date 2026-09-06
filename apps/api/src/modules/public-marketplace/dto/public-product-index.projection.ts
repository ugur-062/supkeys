import { Prisma } from "@rothern/db";
import { effectiveTier } from "../../../common/company/effective-tier";
import type { TierName } from "@rothern/shared";

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
 * satılan bir özellik (SILVER+). İki kart yan yana durduğu için ayrım
 * sözleşme testiyle kilitlenir (`public-product-index.spec.ts`).
 *
 * Dışarıda kalanlar `public-product.projection.ts` ile aynı gerekçelerle:
 * `code` (envanter yapısı), `targetPrice` (ALIŞ hedefi = maliyet),
 * `completionScore` (iç kalite ölçütü), cuid `id`. Fiyat/MOQ AÇIK (v2).
 */
export const PRODUCT_INDEX_SELECT = {
  slug: true,
  name: true,
  description: true,
  images: true,
  unit: true,
  categoryId: true,
  priceMode: true,
  priceAmount: true,
  priceTiers: true,
  priceCurrency: true,
  moq: true,
  publishedAt: true,
  completionScore: true,
  company: {
    select: {
      name: true,
      slug: true,
      city: true,
      country: true,
      industry: true,
      activities: true,
      logoUrl: true,
      tier: true,
      membershipEndAt: true,
      companyVerificationStatus: true,
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
  priceAmount: string | null;
  priceTiers: unknown;
  priceCurrency: string;
  moq: string | null;
  /** Kartta "Yeni" rozetinin kaynağı (≤7 gün) — tarihi istemci yorumlar. */
  publishedAt: string | null;
  company: {
    name: string;
    slug: string;
    city: string | null;
    country: string | null;
    activities: string[];
    /** Kart avatarı; yoksa ad monogramı. */
    logoUrl: string | null;
    /** KYC tamam — kartta "Doğrulanmış" tiki. */
    verified: boolean;
    /** Efektif GOLD — kartta "Gold Üye" rozeti (paketin görünür karşılığı). */
    gold: boolean;
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
    priceAmount: r.priceAmount?.toString() ?? null,
    priceTiers: r.priceTiers,
    priceCurrency: r.priceCurrency,
    moq: r.moq?.toString() ?? null,
    publishedAt: r.publishedAt?.toISOString() ?? null,
    company: {
      // Kapı (`publicProductWhere`) slug'sız firmayı zaten eliyor; boş dize
      // yalnız tip daraltması için.
      name: r.company.name,
      slug: r.company.slug ?? "",
      city: r.company.city,
      country: r.company.country,
      activities: r.company.activities,
      logoUrl: r.company.logoUrl,
      verified: r.company.companyVerificationStatus === "VERIFIED",
      gold: effectiveTier(r.company.tier as TierName, r.company.membershipEndAt) === "GOLD",
    },
  };
}
