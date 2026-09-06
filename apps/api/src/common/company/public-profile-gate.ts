import { Prisma } from "@rothern/db";

/**
 * `/firma/<slug>` HERKESE AÇIK PROFİL KAPISI — TEK KAYNAK.
 *
 * Aynı kural İKİ biçimde yaşıyor ve ikisi birlikte değişmeli — ayrışırlarsa
 * dizinde/sitemap'te görünen bir firmanın profili 404 döner:
 *   · bu fonksiyon — tekil kayıt elde varken (`getBySlug`)
 *   · `listPublic` / `listPublicSlugs` / `directoryFacets` / `buildDirectory`
 *     içindeki Prisma `where` — aynı koşulların sorgu karşılığı
 *
 * PAKET ŞARTI KALKTI (2026-09-06, kullanıcı kararı "premium çekmek için"):
 * ücretsiz (STANDART) firma da profilini yayınlar ve ürün vitrini açar —
 * vitrin envanteri büyütür, gelen bilgi talebi/bağlantı daveti dönüşüm
 * tetiğidir. Paketin karşılığı görünürlük DEĞİL öncelik: dizin ve ürün
 * sıralamasında paketli firma önce gelir, ürün tavanı (`PRODUCT_LIMITS`) ve
 * belge/video (`PRODUCT_MEDIA_TIER`) paketlidir. Süresi dolmuş paket de bu
 * yüzden kapıda değil sıralamada düşer.
 *
 * NOT: pazar yeri İLAN sayfaları bu kapıyı KULLANMAZ; orada firma adı hiç
 * gösterilmiyor (bkz. `public-listing.projection.ts` "İLAN SAHİBİ ANONİM").
 * Firma adı yalnız opt-in `/firma/<slug>` profilinde ve firma dizininde görünür.
 */
export function hasPublicProfile(c: {
  slug: string | null;
  publicEnabled: boolean;
  isActive: boolean;
  isBlocked: boolean;
}): boolean {
  return !!c.slug && c.publicEnabled && c.isActive && !c.isBlocked;
}

/** `hasPublicProfile`in Prisma `where` karşılığı — dizin/sitemap/öneri sorguları. */
export const PUBLIC_PROFILE_WHERE = {
  publicEnabled: true,
  isActive: true,
  isBlocked: false,
  slug: { not: null },
} satisfies Prisma.CompanyWhereInput;

/**
 * HERKESE AÇIK ÜRÜN KAPISI (sorgu biçimi) — TEK KAYNAK.
 *
 * `hasPublicProfile`in ürün karşılığı: ürünün kendi yayın durumu VE sahibinin
 * profil kapısı birlikte sağlanmalı. Üç çağıran var (firma altı ürün listesi,
 * ürün sitemap'i, firmalar-arası ürün dizini) ve kopyalandığında ayrışması
 * SESSİZ olur: paketi biten bir firmanın ürünü dizinde kalır ama profili 404
 * döner, yani ziyaretçi çıkmaz bir bağlantıya tıklar.
 *
 * `slug: { not: null }` ŞART — slug yayında donar ama taslakta null olabilir;
 * slug'sız ürünün URL'i kurulamaz.
 */
export function publicProductWhere(): Prisma.CompanyItemWhereInput {
  return {
    isPublic: true,
    isActive: true,
    slug: { not: null },
    company: PUBLIC_PROFILE_WHERE,
  };
}
