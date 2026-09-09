import { TR_PROVINCES, slugifyText } from "@rothern/shared";

/**
 * ŞEHİR AÇILIŞ SAYFALARININ ADRES ŞEMASI (2026-09-09, Parça 3 — coğrafi SEO).
 *
 * "İstanbul'da çelik boru tedarikçisi" gibi aramalar B2B'de hacmin büyük
 * bölümünü taşır ve bunlar SORGU PARAMETRESİYLE karşılanamaz: `?sehir=` bir
 * süzgeç varyantıdır, kanoniği listenin köküne işaret eder ve indekslenmez.
 * Her ilin KENDİ adresi olmalı ki kendi başlığı, kendi açıklaması ve kendi
 * kanoniği olsun.
 *
 * Slug'da KOD YOK (kategori adresinin tersine): il adları tekildir ve
 * katlanmış hâlleri de tekil kalır — `city.test.ts` 81 ilin çakışmadığını
 * doğrular. Kategoride kod öndeydi çünkü ADLAR tekil değildi.
 *
 * Kaynak `@rothern/shared` `TR_PROVINCES`: firmanın `city` alanı serbest
 * metin ama il adları oradan doğrulanır — uydurma bir "şehir" sayfası
 * üretilmez.
 */

/**
 * Latinizasyon TEK KAYNAK: `@rothern/shared` `slugifyText` — ilan ve ürün
 * slug'ları da onu kullanıyor. Kendi eşlemesini yazan bir kopya, "Iğdır" gibi
 * bir ilde sessizce ayrışır ("igdir" ↔ "gdir") ve iki adres üretirdi.
 */
export function citySlug(name: string): string {
  return slugifyText(name);
}

/** Slug → kanonik il adı. Tanınmayan slug `null` — sayfa 404 verir. */
export function cityFromSlug(slug: string): string | null {
  const s = slug.toLowerCase();
  return TR_PROVINCES.find((p) => citySlug(p.name) === s)?.name ?? null;
}

/** Tüm iller, slug'larıyla — `generateStaticParams` ve bağlantı şeritleri. */
export function allCitySlugs(): { name: string; slug: string }[] {
  return TR_PROVINCES.map((p) => ({ name: p.name, slug: citySlug(p.name) }));
}

export const cityProductPath = (name: string) => `/urunler/sehir/${citySlug(name)}`;
export const cityCompanyPath = (name: string) => `/firmalar/sehir/${citySlug(name)}`;
