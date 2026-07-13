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
  "LETTER_OF_CREDIT", // akreditif — Sight/Usance (+Teyitli)
  "CUSTOM", // özel — serbest not zorunlu
] as const;
export type PaymentCategory = (typeof PAYMENT_CATEGORIES)[number];

export const LC_TYPES = ["SIGHT", "USANCE"] as const;
export type LcSubType = (typeof LC_TYPES)[number];

export type DerivedPaymentTiming = "BEFORE_DELIVERY" | "AFTER_DELIVERY";

/** Plandan zamanlama türet — Listing.paymentTiming buna göre yazılır. */
export function derivePaymentTiming(
  category: PaymentCategory,
): DerivedPaymentTiming {
  return category === "ADVANCE" || category === "LETTER_OF_CREDIT"
    ? "BEFORE_DELIVERY"
    : "AFTER_DELIVERY";
}

/** Vade günü bu planda ZORUNLU mu? (Kısmi peşinde opsiyoneldir — kapsam dışı.) */
export function paymentPlanRequiresDays(
  category: PaymentCategory,
  lcType?: LcSubType | null,
): boolean {
  if (category === "DEFERRED" || category === "CHEQUE") return true;
  return category === "LETTER_OF_CREDIT" && lcType === "USANCE";
}

/** Teminat mektubu önerilir mi? Yalnız peşinde — LC'de garanti zaten bankada. */
export function paymentPlanSuggestsGuarantee(
  category: PaymentCategory,
): boolean {
  return category === "ADVANCE";
}
