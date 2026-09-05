import type { AiTenderExtractResult } from "./ai-tender-draft";

/**
 * AI ARAMA — doğal dil → yapılandırılmış süzgeç (api → web sözleşmesi, 2026-09-05).
 *
 * Model SONUÇ üretmez, süzgeç üretir; sonuç listesi mevcut arama/süzgeç
 * motorundan gelir (ürün dizini / açık talepler). Böylece "AI ne anladı"
 * her zaman görünür ve her parçası tek tıkla kaldırılabilir.
 */
export type AiSearchPortal = "satinalma" | "satis";

/** Sonuç vermediği için sunucuda KALDIRILAN süzgeçler (bantta söylenir). */
export type AiSearchRelaxed = "category" | "priceMax" | "quantity" | "activity" | "verifiedOnly" | "city";

export interface AiSearchIntentResult {
  portal: AiSearchPortal;
  /** "Anladığım: …" — kullanıcıya gösterilen tek cümle. */
  summary: string;
  /** Kısa arama ifadesi (1-4 kelime) ya da null. */
  query: string | null;
  /** Katalogda çözülen kategori (kod backend'de bulunur, model yazmaz). */
  category: { id: string; nameTr: string } | null;
  /** Modelin ürün tipi ifadesi — katalogda bulunamadıysa da döner (kullanıcı görsün). */
  categoryHint: string | null;
  /** Kanonik il adı (veritabanındaki yazımla) ya da null. */
  city: string | null;
  verifiedOnly: boolean;
  /** CompanyActivityCode ya da null. */
  activity: string | null;
  /** Birim fiyat tavanı. */
  priceMax: number | null;
  currency: string | null;
  quantity: number | null;
  unit: string | null;
  keywords: string[];
  /**
   * Sunucu, süzgeçlerin tamamı 0 sonuç verirse en az güvenilenden başlayarak
   * (kategori → fiyat tavanı → adet → faaliyet → doğrulanmış → şehir) kaldırır;
   * kaldırılanlar burada, ilgili alanlar null/false döner. Arama terimi asla
   * kaldırılmaz.
   */
  relaxed: AiSearchRelaxed[];
  /** Kaldırılan kategorinin adı (bantta "… sonuç vermedi" için). */
  relaxedCategoryName: string | null;
  /** Satınalma: aynı tanımla talep taslağı (sihirbaz köprüsü); satışta null. */
  draft: AiTenderExtractResult | null;
  downgraded: boolean;
  warned: boolean;
}
