import { Prisma } from "@rothern/db";
import { PRODUCT_MEDIA_TIER, tierAtLeast } from "@rothern/shared";
import { effectiveTier } from "../../../common/company/effective-tier";

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
 * ── FİYAT / MOQ HERKESE AÇIK (v2, 2026-09-04 — kullanıcı kararı) ─────────
 * Europages kalıbı: fiyat, kademe tablosu, para birimi ve MOQ ziyaretçiye
 * açık — vitrin ancak fiyatıyla vitrindir. Aynı gün önce kapatılıp aynı gün
 * geri açıldı; üyeye kapalı kalan tek şey "Bilgi iste" formu ve iletişim.
 */
export const PUBLIC_PRODUCT_SELECT = {
  // İç kimlik yalnız ÇEVİRİ eşlemesi için (i18n Faz 1e); mapper yanıta YAZMAZ.
  id: true,
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
  priceAmount: true,
  priceTiers: true,
  priceCurrency: true,
  moq: true,
  videoUrl: true,
  externalUrl: true,
  documents: true,
  keywords: true,
  attributes: true,
  priceMode: true,
  publishedAt: true,
  updatedAt: true,
  /* Satıcının EFEKTİF paketi — belge/video Silver+ (`PRODUCT_MEDIA_TIER`).
     Mapper yanıta YAZMAZ; yalnız medyayı süzmek için okur (arayüz testi
     D-192: paketi düşen firmanın videosu/belgeleri servis edilmeye devam
     ediyordu). Seçim projeksiyonda durduğu için bu beyaz listeyi kullanan
     her uç (herkese açık ürün, panel ürün keşfi) kuralı kendiliğinden alır. */
  company: { select: { tier: true, membershipEndAt: true } },
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
  priceAmount: string | null;
  priceTiers: unknown;
  priceCurrency: string;
  moq: string | null;
  publishedAt: string | null;
  updatedAt: string;
}

/** Kart — detayın dar alt kümesi (şartname/nitelik gövdesi taşımaz). */
export type PublicProductCard = Pick<
  PublicProduct,
  | "slug"
  | "name"
  | "images"
  | "priceMode"
  | "priceAmount"
  | "priceTiers"
  | "priceCurrency"
  | "moq"
  | "unit"
  | "categoryId"
> & { excerpt: string | null };

/**
 * Medya (video + belge) bu satırda servis edilebilir mi: satıcının efektif
 * paketi `PRODUCT_MEDIA_TIER` (Silver) ve üstü. Kayıt SİLİNMEZ — paket geri
 * gelince medya yeniden görünür (fail-closed ama yıkıcı değil).
 */
function mediaAllowed(r: PublicProductRow): boolean {
  const c = r.company as { tier: string; membershipEndAt: Date | null } | undefined;
  if (!c) return false;
  return tierAtLeast(effectiveTier(c.tier, c.membershipEndAt), PRODUCT_MEDIA_TIER);
}

/**
 * Belgeler — `anonymous` (herkese açık uç) iken YALNIZ ad döner; indirme
 * adresi üyeye (görünürlük tablosu `documentDownload: "member"`, kullanıcı
 * kararı T-18 / arayüz testi D-331). Gizlenen alan yanıta HİÇ yazılmaz.
 */
function projectDocuments(docs: unknown, anonymous: boolean): unknown {
  if (!anonymous || !Array.isArray(docs)) return docs;
  return docs
    .filter((d): d is { title?: unknown } => !!d && typeof d === "object")
    .map((d) => ({ title: typeof d.title === "string" ? d.title : "" }));
}

export function toPublicProduct(
  r: PublicProductRow,
  opts: { anonymous?: boolean } = {},
): PublicProduct {
  const media = mediaAllowed(r);
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
    videoUrl: media ? r.videoUrl : null,
    externalUrl: r.externalUrl,
    documents: media ? projectDocuments(r.documents, opts.anonymous === true) : null,
    keywords: r.keywords,
    attributes: r.attributes,
    priceMode: r.priceMode,
    priceAmount: r.priceAmount?.toString() ?? null,
    priceTiers: r.priceTiers,
    priceCurrency: r.priceCurrency,
    moq: r.moq?.toString() ?? null,
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
    priceAmount: r.priceAmount?.toString() ?? null,
    priceTiers: r.priceTiers,
    priceCurrency: r.priceCurrency,
    moq: r.moq?.toString() ?? null,
    unit: r.unit,
    categoryId: r.categoryId,
    excerpt: flat ? (flat.length <= 160 ? flat : `${flat.slice(0, 159)}…`) : null,
  };
}
