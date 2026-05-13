/**
 * V2-6 — Çoklu para birimi formatlama yardımcıları (8 birim).
 * TRY (₺), USD ($), EUR (€), GBP (£), CHF (₣), JPY (¥), AED (د.إ), CNY (¥).
 */

export type Currency =
  | "TRY"
  | "USD"
  | "EUR"
  | "GBP"
  | "CHF"
  | "JPY"
  | "AED"
  | "CNY";

const symbols: Record<Currency, string> = {
  TRY: "₺",
  USD: "$",
  EUR: "€",
  GBP: "£",
  CHF: "₣",
  JPY: "¥",
  AED: "د.إ",
  CNY: "¥",
};

const localeMap: Record<Currency, string> = {
  TRY: "tr-TR",
  USD: "en-US",
  EUR: "de-DE",
  GBP: "en-GB",
  CHF: "de-CH",
  JPY: "ja-JP",
  AED: "ar-AE",
  CNY: "zh-CN",
};

export function getCurrencySymbol(currency: Currency): string {
  return symbols[currency] ?? currency;
}

/**
 * Kullanıcı locale'üne göre para birimi formatla. Default 2 ondalık.
 */
export function formatPrice(
  amount: number | string,
  currency: Currency = "TRY",
  decimals: number = 2,
): string {
  const num = typeof amount === "string" ? Number(amount) : amount;
  if (!Number.isFinite(num)) return "—";
  return new Intl.NumberFormat(localeMap[currency], {
    style: "currency",
    currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num);
}

/**
 * Bid karşılaştırma için: orijinal currency + TRY equivalent gösterimi.
 * TRY ise sadece TRY formatla.
 */
export function formatPriceWithTry(
  amount: number | string,
  currency: Currency,
  rate: number,
): string {
  const num = typeof amount === "string" ? Number(amount) : amount;
  if (!Number.isFinite(num)) return "—";
  if (currency === "TRY") return formatPrice(num, "TRY");
  return `${formatPrice(num, currency)} (≈ ${formatPrice(num * rate, "TRY")})`;
}
