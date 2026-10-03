import { DEFAULT_LOCALE, LOCALES, type Locale } from "@rothern/i18n";

/**
 * HERKESE AÇIK SAYFA ÇAPALARI — dil başına (arayüz testi kapanış COPY:footer).
 *
 * Kök neden: bölüm id'leri ve onlara giden bağlantılar Türkçe sabitti
 * (`/nasil-calisir#fiyatlar`, `/#kategoriler`); dil farkında `Link` yolu
 * çeviriyor ama parçayı çevirmiyordu → EN/RU ziyaretçi
 * `/en/how-it-works#fiyatlar` görüyordu. Bölüm id'si de bağlantı da buradan
 * okunur; Türkçe adresler (paylaşılmış bağlantılar) aynen kalır.
 */
export type PublicAnchor = "pricing" | "features" | "faq" | "categories";

const ANCHORS: Record<PublicAnchor, Record<Locale, string>> = {
  pricing: { tr: "fiyatlar", en: "pricing", ru: "tarify" },
  features: { tr: "ozellikler", en: "features", ru: "vozmozhnosti" },
  faq: { tr: "sss", en: "faq", ru: "voprosy" },
  categories: { tr: "kategoriler", en: "categories", ru: "kategorii" },
};

function asLocale(locale: string | null | undefined): Locale {
  return (LOCALES as readonly string[]).includes(locale ?? "") ? (locale as Locale) : DEFAULT_LOCALE;
}

/** Bölümün o dildeki id'si (`<section id>` ve `#` parçası). */
export function anchorId(anchor: PublicAnchor, locale: string | null | undefined): string {
  return ANCHORS[anchor][asLocale(locale)];
}

/** "Fiyatlar" bağlantısı — nasıl çalışır sayfasının paket bölümü. */
export function pricingHref(locale: string | null | undefined): string {
  return `/nasil-calisir#${anchorId("pricing", locale)}`;
}

/** "Kategoriler" bağlantısı — anasayfanın (alıcı yüzü) kategori vitrini. */
export function categoriesHref(locale: string | null | undefined): string {
  return `/#${anchorId("categories", locale)}`;
}

/** Hangi dilde olursa olsun kategori çapası mı (anasayfa yüz geçişi için). */
export function isCategoriesAnchor(id: string): boolean {
  return Object.values(ANCHORS.categories).includes(id);
}
