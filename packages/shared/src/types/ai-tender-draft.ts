/**
 * Faz AI-1 — AI belge çıkarımı ARA modeli (api üretir, web tüketir).
 *
 * İhale formuyla BİREBİR değil: AI'ın belgeden güvenilir çıkarabileceği çekirdek
 * alanlar + alan-başına güven + sayfa özetleri (refine, belgeyi yeniden okumadan
 * JSON üstünden konuşur). Kategori (UNSPSC id) ve adres (CompanyAddress id) gibi
 * platform-içi kimlikler AI'dan İSTENMEZ — kullanıcı seçer (missingRequired'da
 * bildirilir).
 */

/** Alan işaretleme sebepleri (kullanıcıya gösterilir). */
export type AiFieldFlagReason =
  /** Model düşük güven bildirdi. */
  | "low_confidence"
  /** Vision yolunda varsayılan-işaretli kritik alan (miktar/birim/tarih/para birimi). */
  | "vision_critical"
  /** Değer shared validation'dan geçemedi → null'a düşürüldü. */
  | "validation_failed"
  /** Belgede fiyatlar KDV dahil görünüyor — formda fiyatlar KDV hariç olmalı. */
  | "vat_warning";

export interface AiFieldFlag {
  /** Form alan yolu — ör. "title", "items.2.quantity", "bidsCloseAt". */
  path: string;
  reason: AiFieldFlagReason;
}

export interface AiTenderDraftItem {
  name: string | null;
  description: string | null;
  /** 0.001–1e9, en fazla 3 ondalık (shared limits). */
  quantity: number | null;
  /** Serbest metin, ≤20 karakter — "adet", "kg", "m", "paket"… */
  unit: string | null;
  materialCode: string | null;
  /** ISO tarih (YYYY-MM-DD) veya null. */
  requiredByDate: string | null;
  /** Hedef birim fiyat (KDV hariç), ≤1e15, 2 ondalık. */
  targetUnitPrice: number | null;
}

export interface AiTenderDraft {
  title: string | null;
  description: string | null;
  /** TRY|USD|EUR|GBP|CHF|JPY|AED|CNY|RUB */
  primaryCurrency: string | null;
  /** ListingDeliveryTerm enum değeri (DOMESTIC_* | Incoterms). */
  deliveryTerm: string | null;
  /** ListingPaymentCategory enum değeri. */
  paymentCategory: string | null;
  /** Vade günü (1-365) — DEFERRED/CHEQUE/SENET/USANCE için. */
  paymentDays: number | null;
  /** Peşin yüzdesi (1-100) — yalnız ADVANCE. */
  advancePercent: number | null;
  /** Teklif kapanış tarihi, ISO (gelecekte, en fazla +2 yıl). */
  bidsCloseAt: string | null;
  keywords: string[];
  /** Belge yabancı dilde/yurt dışı teslimat gösteriyorsa. */
  isInternational: boolean | null;
  /** Şartname/koşul metni (belgeden özet, ≤10000). */
  termsAndConditions: string | null;
  items: AiTenderDraftItem[];
  /** Belgede fiyatların KDV dahil görünüp görünmediği (null = belirsiz). */
  pricesIncludeVat: boolean | null;
  /** Refine için sayfa başına 1-2 cümlelik özet (belge yeniden okunmaz). */
  pageSummaries: string[];
}

/** Extract/refine endpoint yanıtı (api → web sözleşmesi). */
export interface AiTenderExtractResult {
  draft: AiTenderDraft;
  flags: AiFieldFlag[];
  /** Kullanıcının tamamlaması gereken zorunlu alanlar (TR etiketleriyle). */
  missingRequired: string[];
  route: "text" | "pdf_vision" | "image_vision";
  /** Premium istendi ama alt-bütçe doluydu → ucuz modelle çalışıldı. */
  downgraded: boolean;
  warned: boolean;
}
