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
export type PublicAnchor = "pricing" | "features" | "faq" | "categories" | "inquiry" | "products";

const ANCHORS: Record<PublicAnchor, Record<Locale, string>> = {
  pricing: { tr: "fiyatlar", en: "pricing", ru: "tarify" },
  features: { tr: "ozellikler", en: "features", ru: "vozmozhnosti" },
  faq: { tr: "sss", en: "faq", ru: "voprosy" },
  categories: { tr: "kategoriler", en: "categories", ru: "kategorii" },
  // Ürün sayfasının "Bilgi iste" eylem kutusu (kart CTA'sının hedefi) ve firma
  // profilinin ürün portföyü bölümü (arayüz testi kalanlar COPY: EN/RU
  // bağlantılarda `#bilgi-iste` / `#urunler` kalmıştı).
  inquiry: { tr: "bilgi-iste", en: "request-info", ru: "zapros-informacii" },
  products: { tr: "urunler", en: "products", ru: "tovary" },
};

function asLocale(locale: string | null | undefined): Locale {
  return (LOCALES as readonly string[]).includes(locale ?? "") ? (locale as Locale) : DEFAULT_LOCALE;
}

/** Bölümün o dildeki id'si (`<section id>` ve `#` parçası). */
export function anchorId(anchor: PublicAnchor, locale: string | null | undefined): string {
  return ANCHORS[anchor][asLocale(locale)];
}

/**
 * Bölümün DİĞER dillerdeki id'leri — bölümün başına görünmez çapa olarak
 * basılır; dil değiştirilmiş ya da eski (Türkçe parçalı) paylaşılmış bir
 * bağlantı (`/en/companies/acme#urunler`) JS'siz de bölüme iner.
 */
export function anchorAliasIds(anchor: PublicAnchor, locale: string | null | undefined): string[] {
  const own = anchorId(anchor, locale);
  return [...new Set(Object.values(ANCHORS[anchor]))].filter((id) => id !== own);
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
