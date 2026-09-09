/**
 * AI ile AÇIKLAMA GÜÇLENDİRME — api ↔ web sözleşmesi (SEO Parça 8).
 *
 * Model TASLAK üretir; hiçbir şey yazmaz. Kullanıcı taslağı görür, ister
 * uygular ister atar (AI çerçevesi kuralı: model doğrudan yazamaz).
 * Girdi yalnız kullanıcının KENDİ verdiği olgulardır (ad, kategori, nitelik,
 * anahtar kelime, mevcut açıklama); model bunları TAM CÜMLELERLE, arama ve
 * alıntı için düzenler — yeni teknik iddia, fiyat, sertifika UYDURAMAZ.
 */
export type AiSeoEnrichKind = "product" | "company" | "listing";

export interface AiSeoEnrichInput {
  kind: AiSeoEnrichKind;
  /** Ürün adı / firma adı / talep başlığı. */
  name: string;
  description?: string | null;
  categoryName?: string | null;
  /** Ürün: nitelikler "Etiket: değer"; firma: hizmetler; talep: kalem adları. */
  facts?: string[];
  keywords?: string[];
  brand?: string | null;
  city?: string | null;
  industry?: string | null;
}

export interface AiSeoEnrichResult {
  /** 300-700 karakter, 3-6 cümle, Türkçe, yalnız verilen olgular. */
  description: string;
  /** 5-10 küçük harf terim (mevcutlarla birleşmiş, tekrarsız). */
  keywords: string[];
  /** Daha açıklayıcı ad/başlık önerisi ya da null (zaten iyiyse). */
  titleSuggestion: string | null;
  /** Modelin eksik bulduğu olgular — kullanıcı doldursun ("ölçü yok", "standart yok"). */
  missingFacts: string[];
  downgraded: boolean;
  warned: boolean;
}
