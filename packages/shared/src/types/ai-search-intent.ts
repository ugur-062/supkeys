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
export type AiSearchRelaxed =
  | "category"
  | "priceMax"
  | "quantity"
  | "activity"
  | "verifiedOnly"
  | "city"
  | "country"
  | "query";

export interface AiSearchIntentResult {
  portal: AiSearchPortal;
  /** Kullanıcıya gösterilen tek cümle — ARAYÜZ dilinde, öneksiz (bant başlığı istemcide). */
  summary: string;
  /** Kısa arama ifadesi (1-4 kelime) ya da null. */
  query: string | null;
  /** Katalogda çözülen kategori (kod backend'de bulunur, model yazmaz); ad okuyucunun dilinde. */
  category: { id: string; name: string } | null;
  /**
   * Modelin ürün tipi ifadesi — katalog araması için TÜRKÇE; kullanıcıya
   * GÖSTERİLMEZ (EN/RU arayüzde Türkçe sızıntı olurdu). Yalnız "kategori
   * bulunamadı" koşulunu bildirir.
   */
  categoryHint: string | null;
  /**
   * Şehir süzgecinin URL değeri (`?sehir=`): dünya şehir listesinin kalıcı
   * adresi ("istanbul", "de-munich") — iki portalda da; satışta alıcısı
   * eşlenmemiş şehirdeyse o ham metin. Yoksa null.
   */
  city: string | null;
  /** Şehrin okuyucunun dilindeki adı (çip etiketi). */
  cityName: string | null;
  /**
   * Ülke süzgeci (ISO kod, `?ulke=`) — satınalmada SATICININ, satışta
   * ALICININ ülkesi; yoksa null.
   */
  country: string | null;
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
   * (kategori → fiyat tavanı → adet → faaliyet → doğrulanmış → şehir → ülke) kaldırır;
   * kaldırılanlar burada, ilgili alanlar null/false döner. Arama terimi asla
   * tümden kaldırılmaz; hâlâ 0 ise kelimeleri "biri hariç" deneyerek KISALTIR
   * (`query` = kalan kelimeler; `relaxed` "query" içerir).
   */
  relaxed: AiSearchRelaxed[];
  /** Kaldırılan kategorinin adı, okuyucunun dilinde (bantta "… sonuç vermedi" için). */
  relaxedCategoryName: string | null;
  /** Satınalma: aynı tanımla talep taslağı (sihirbaz köprüsü); satışta null. */
  draft: AiTenderExtractResult | null;
  downgraded: boolean;
  warned: boolean;
}
