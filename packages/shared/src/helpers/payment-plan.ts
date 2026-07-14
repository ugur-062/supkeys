/**
 * Ödeme planı — Faz 2 modeli. Kategoriler DB enum'larıyla birebir aynı
 * (@rothern/db'ye bağımlılık almamak için string literal tekrarlanır).
 *
 * Zamanlama (teslim öncesi/sonrası) kullanıcıya SORULMAZ; plandan türetilir:
 * alıcının teslimden ÖNCE aksiyonu olan kategoriler (peşin ödeme, akreditif
 * açtırma) BEFORE, ödeme aracı teslimde/sonrasında olanlar AFTER.
 */
export const PAYMENT_CATEGORIES = [
  "ADVANCE", // peşin (+yüzde; %100 = tam peşin, %<100 YALNIZ yurtiçi)
  "DEFERRED", // vadeli — teslimden N gün sonra
  "OPEN_ACCOUNT", // açık hesap — teslim sonrası, vadesiz
  "CHEQUE", // çek — vade günlü
  "SENET", // senet/bono — vade günlü kıymetli evrak (yurtiçi)
  "LETTER_OF_CREDIT", // akreditif — Sight/Usance (+Teyitli)
  "CASH_AGAINST_DOCS", // vesaik mukabili — belge karşılığı ödeme (dış ticaret)
  "CUSTOM", // özel — serbest not zorunlu
] as const;
export type PaymentCategory = (typeof PAYMENT_CATEGORIES)[number];

export const LC_TYPES = ["SIGHT", "USANCE"] as const;
export type LcSubType = (typeof LC_TYPES)[number];

export type DerivedPaymentTiming = "BEFORE_DELIVERY" | "AFTER_DELIVERY";

/** Plandan zamanlama türet — Listing.paymentTiming buna göre yazılır.
 *  Vesaik mukabili: alıcı belge karşılığı (mal yoldayken) öder → BEFORE_DELIVERY
 *  penceresi (ACCEPTED'dan itibaren açık, sevkiyat sırasında ödeme yapılabilir). */
export function derivePaymentTiming(
  category: PaymentCategory,
): DerivedPaymentTiming {
  return category === "ADVANCE" ||
    category === "LETTER_OF_CREDIT" ||
    category === "CASH_AGAINST_DOCS"
    ? "BEFORE_DELIVERY"
    : "AFTER_DELIVERY";
}

/** Vade günü bu planda ZORUNLU mu? (Kısmi peşinde opsiyoneldir — kapsam dışı.) */
export function paymentPlanRequiresDays(
  category: PaymentCategory,
  lcType?: LcSubType | null,
): boolean {
  if (
    category === "DEFERRED" ||
    category === "CHEQUE" ||
    category === "SENET"
  ) {
    return true;
  }
  return category === "LETTER_OF_CREDIT" && lcType === "USANCE";
}

/** Teminat mektubu önerilir mi? Yalnız peşinde — LC'de garanti zaten bankada. */
export function paymentPlanSuggestsGuarantee(
  category: PaymentCategory,
): boolean {
  return category === "ADVANCE";
}

/**
 * Gönderim ÖNCESİ onaylı olması gereken peşin tutar (S3). ADVANCE'ta sipariş
 * tutarının advancePercent'i; diğer kategorilerde 0 (peşin şartı yok).
 * advancePercent yoksa tam peşin (%100) varsayılır — legacy güvenli taban.
 */
export function advanceDueAmount(
  category: PaymentCategory,
  advancePercent: number | null | undefined,
  totalAmount: number,
): number {
  if (category !== "ADVANCE") return 0;
  const pct = advancePercent ?? 100;
  // 2 ondalık — para alanı Decimal(18,2); yuvarlama tavan kontrolüyle tutarlı.
  return Math.round(totalAmount * (pct / 100) * 100) / 100;
}

/** Akreditif siparişi mi? Adım seti ve ödeme akışı LC'de tamamen farklıdır. */
export function isLetterOfCredit(category: PaymentCategory): boolean {
  return category === "LETTER_OF_CREDIT";
}

/** Teslimden sonra vadesi hesaplanan (vade günlü) ödeme kategorileri —
 *  DEFERRED/CHEQUE/SENET ve kısmi peşin kalanı (ADVANCE + paymentDays). */
export const DUE_DATE_CATEGORIES: readonly PaymentCategory[] = [
  "DEFERRED",
  "CHEQUE",
  "SENET",
  "ADVANCE", // kısmi peşinde kalan vadeli olabilir
];

/**
 * Vadeli ödeme günü olan siparişte vade tarihi = teslim tarihi + paymentDays.
 * Yalnız DUE_DATE_CATEGORIES için anlamlı; değilse null. deliveredAt yoksa
 * (henüz teslim edilmedi) null.
 */
export function paymentDueDate(
  category: PaymentCategory,
  paymentDays: number | null | undefined,
  deliveredAt: Date | null | undefined,
): Date | null {
  if (!deliveredAt || !paymentDays) return null;
  if (!DUE_DATE_CATEGORIES.includes(category)) return null;
  const d = new Date(deliveredAt);
  d.setDate(d.getDate() + paymentDays);
  return d;
}
