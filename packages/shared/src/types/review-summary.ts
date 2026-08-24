/**
 * Değerlendirme ÖZETİ (2026-08-22) — firma bazında gruplu, api → web sözleşmesi.
 *
 * Karar: sipariş-başına satır + değerlendiren firma adı yerine:
 *  - her ticari ortak TEK satır (ortalama · N sipariş · yorumlar),
 *  - genel puan = ortak ortalamalarının ortalaması (her ortak bir oy — tek
 *    büyük müşteri puanı domine edemez),
 *  - ad görünürlüğü: herkese açık sayfada ASLA; platform içinde yalnız
 *    değerlendiren "referans olarak adım görünsün" dediyse (CompanyReview.showName).
 *    Aksi halde "Doğrulanmış alıcı/tedarikçi" (rol siparişten türetilir).
 */
export type ReviewerRole = "buyer" | "seller";

export interface ReviewComment {
  rating: number;
  comment: string;
  /** ISO */
  createdAt: string;
}

export interface ReviewPartner {
  /** Firma adı — yalnız izinliyse (showName) ve platform-içi görünümde; aksi null. */
  name: string | null;
  /**
   * Değerlendirenin ilişkideki rolü. RLS aktivasyonunda çapraz-firma `order`
   * satırı gizlenebildiği için null olabilir (denetim 2026-08-23 Parça 4) —
   * UI nötr "Doğrulanmış ortak" etiketine düşer.
   */
  role: ReviewerRole | null;
  /** 1-5, 1 ondalık (sunucuda yuvarlanır). */
  avg: number;
  /** Bu ortağın değerlendirdiği sipariş sayısı. */
  count: number;
  /** En son değerlendirme tarihi (ISO). */
  lastAt: string;
  /** Yorumlu değerlendirmeler (en yeni önce, en fazla 5). */
  comments: ReviewComment[];
}

export interface ReviewSummary {
  /** Firma-ağırlıklı genel ortalama (1 ondalık); değerlendirme yoksa 0. */
  avg: number;
  firms: number;
  orders: number;
  /** Yıldız dağılımı — sipariş bazında (5..1). */
  distribution: { 5: number; 4: number; 3: number; 2: number; 1: number };
  partners: ReviewPartner[];
}
