import { Prisma } from "@rothern/db";
import { tierAtLeast } from "@rothern/shared";
import { anyPackageWhere, effectiveTier } from "./effective-tier";

/**
 * `/firma/<slug>` HERKESE AÇIK PROFİL KAPISI — TEK KAYNAK.
 *
 * Aynı kural İKİ biçimde yaşıyor ve ikisi birlikte değişmeli — ayrışırlarsa
 * dizinde/sitemap'te görünen bir firmanın profili 404 döner:
 *   · bu fonksiyon — tekil kayıt elde varken (`getBySlug`)
 *   · `listPublic` / `listPublicSlugs` / `directoryFacets` içindeki Prisma
 *     `where` — aynı koşulların sorgu karşılığı
 *
 * NOT: pazar yeri İLAN sayfaları bu kapıyı KULLANMAZ; orada firma adı hiç
 * gösterilmiyor (bkz. `public-listing.projection.ts` "İLAN SAHİBİ ANONİM").
 * Firma adı yalnız opt-in `/firma/<slug>` profilinde ve firma dizininde görünür.
 *
 * INV-TIER-1: paket EFEKTİF okunur (süresi dolmuş GOLD, STANDART sayılır).
 */
export function hasPublicProfile(c: {
  slug: string | null;
  publicEnabled: boolean;
  isActive: boolean;
  isBlocked: boolean;
  tier: string;
  membershipEndAt: Date | null;
}): boolean {
  return (
    !!c.slug &&
    c.publicEnabled &&
    c.isActive &&
    !c.isBlocked &&
    tierAtLeast(effectiveTier(c.tier, c.membershipEndAt), "SILVER")
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
export function publicProductWhere(now: Date = new Date()): Prisma.CompanyItemWhereInput {
  return {
    isPublic: true,
    isActive: true,
    slug: { not: null },
    company: {
      publicEnabled: true,
      isActive: true,
      isBlocked: false,
      slug: { not: null },
      ...anyPackageWhere(now),
    },
  };
}
