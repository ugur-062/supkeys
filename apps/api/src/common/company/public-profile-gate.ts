import { Prisma } from "@rothern/db";
import { looksLikeProse } from "@rothern/shared";

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

/** `hasPublicProfile`in Prisma `where` karşılığı — dizin/öneri sorguları. */
export const PUBLIC_PROFILE_WHERE = {
  publicEnabled: true,
  isActive: true,
  isBlocked: false,
  slug: { not: null },
} satisfies Prisma.CompanyWhereInput;

/**
 * VİTRİN ≠ İNDEKS — profil tarafının ikinci kapısı (2026-09-15).
 *
 * İlan tarafında bu ayrım zaten vardı (`listing-visibility.ts`: vitrine çıkan
 * her ilan indekslenmez). Profil tarafında YOKTU ve profiller opt-in olduğu
 * için sorun da görünmüyordu. `publicEnabled` varsayılanı AÇILDIĞINDA (kayıt
 * akışı) sorun gerçek olur: içi boş profiller toplu hâlde Google'a gider.
 *
 * ÖLÇÜM: staging'de 26 firmanın SIFIRININ logosu vardı. Eşiksiz açsaydık
 * onlarca "ad + şehir"den ibaret sayfa indeksletirdik — ince içerik, ve tam
 * da kazanmaya çalıştığımız alan otoritesini AŞINDIRIR.
 *
 * EŞİK: anlamlı bir tanıtım metni (`looksLikeProse` — test verisi ve tek
 * kelimelik doldurma elenir) ARTI en az bir somut sinyal (logo · yayında ürün ·
 * web sitesi). Profil VİTRİNDE kalır, yalnız sitemap ve robots kapanır;
 * ziyaretçi bağlantıyla gelirse sayfayı görür.
 */
export function isProfileIndexable(c: {
  aboutText: string | null;
  logoUrl: string | null;
  website: string | null;
  publicProductCount: number;
}): boolean {
  if (!looksLikeProse(c.aboutText ?? "")) return false;
  return (
    !!c.logoUrl?.trim() ||
    !!c.website?.trim() ||
    c.publicProductCount > 0
  );
}

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
