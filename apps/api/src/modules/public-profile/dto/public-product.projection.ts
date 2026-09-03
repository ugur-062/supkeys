import { Prisma } from "@rothern/db";

/**
 * HERKESE AÇIK ÜRÜN YANSITMASI — beyaz liste (Faz 2).
 *
 * `PUBLIC_LISTING_SELECT` ile aynı disiplin: listelenmeyen kolon Prisma'dan
 * hiç dönmez, mapper'da unutulsa bile sızamaz.
 *
 * ── İLANDAN FARKI: BURADA FİRMA ADI GÖRÜNÜR ──────────────────────────────
 * İlan sayfasında sahip ANONİM (kim ne alıyor rekabet istihbaratı). Ürün
 * sayfası tam tersi: firmanın KENDİ vitrini, opt-in (`publicEnabled`) ve
 * satılan bir özellik. Ayrım tutarlı:
 *   ilan  = işlem  → anonim
 *   ürün  = vitrin → firma adıyla
 *
 * ── DIŞARIDA BIRAKILANLAR ────────────────────────────────────────────────
 * `code`        — firma içi stok kodu, dışarıya bir şey ifade etmez ve
 *                 rakibe envanter yapısını gösterir.
 * `targetPrice` — kalem kataloğunun ALIŞ hedef fiyatı (ilan açarken kullanılır),
 *                 satış fiyatı DEĞİL. Karıştırılırsa firmanın maliyeti sızar.
 * `usageCount` / `lastUsedAt` — iç kullanım istatistiği.
 * `createdById` — kişi kimliği (KVKK).
 * `completionScore` — iç kalite ölçütü; ziyaretçiye "bu ürün %60 dolu"
 *                 demek satıcıyı küçük düşürür, alıcıya bir şey söylemez.
 * `id` (cuid)   — dışarıya `slug` verilir.
 *
 * ── FİYAT / MOQ ANONİME KAPALI (görünürlük katmanı, 2026-09-04) ──────────
 * Fiyat tutarı, kademe tablosu, para birimi ve MOQ herkese açık uçtan
 * DÖNMEZ. Fiyat, kazıyıcı ve rakip için en değerli alan; ziyaretçi "Fiyat
 * için giriş yapın" görür, üye panelde (`company/items/discover`) fiyatı
 * görür. Yalnız `priceMode` kalır: "fiyat listesi VAR ama giriş ister" ile
 * "satıcı fiyat açıklamıyor, teklif isteyin" ayrımı dürüst kalsın diye.
 */
export const PUBLIC_PRODUCT_SELECT = {
  slug: true,
  name: true,
  description: true,
  specification: true,
  brand: true,
  mpn: true,
  unit: true,
  unitCode: true,
  categoryId: true,
  images: true,
  videoUrl: true,
  externalUrl: true,
  documents: true,
  keywords: true,
  attributes: true,
  priceMode: true,
  publishedAt: true,
  updatedAt: true,
} satisfies Prisma.CompanyItemSelect;

export type PublicProductRow = Prisma.CompanyItemGetPayload<{
  select: typeof PUBLIC_PRODUCT_SELECT;
}>;

export interface PublicProduct {
  slug: string;
  name: string;
  description: string | null;
  specification: string | null;
  brand: string | null;
  mpn: string | null;
  unit: string;
  unitCode: string | null;
  categoryId: string | null;
  images: string[];
  videoUrl: string | null;
  externalUrl: string | null;
  documents: unknown;
  keywords: string[];
  attributes: unknown;
  priceMode: string;
  publishedAt: string | null;
  updatedAt: string;
}

/** Kart — detayın dar alt kümesi (şartname/nitelik gövdesi taşımaz). */
export type PublicProductCard = Pick<
  PublicProduct,
  "slug" | "name" | "images" | "priceMode" | "unit" | "categoryId"
> & { excerpt: string | null };

export function toPublicProduct(r: PublicProductRow): PublicProduct {
  return {
    slug: r.slug ?? "",
    name: r.name,
    description: r.description,
    specification: r.specification,
    brand: r.brand,
    mpn: r.mpn,
    unit: r.unit,
    unitCode: r.unitCode,
    categoryId: r.categoryId,
    images: r.images,
    videoUrl: r.videoUrl,
    externalUrl: r.externalUrl,
    documents: r.documents,
    keywords: r.keywords,
    attributes: r.attributes,
    priceMode: r.priceMode,
    publishedAt: r.publishedAt?.toISOString() ?? null,
    updatedAt: r.updatedAt.toISOString(),
  };
}

export function toPublicProductCard(r: PublicProductRow): PublicProductCard {
  const flat = (r.description ?? "").replace(/\s+/g, " ").trim();
  return {
    slug: r.slug ?? "",
    name: r.name,
    images: r.images,
    priceMode: r.priceMode,
    unit: r.unit,
    categoryId: r.categoryId,
    excerpt: flat ? (flat.length <= 160 ? flat : `${flat.slice(0, 159)}…`) : null,
  };
}
