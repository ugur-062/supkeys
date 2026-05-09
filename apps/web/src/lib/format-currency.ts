/**
 * V2-3 — Çoklu para birimi formatlama yardımcıları.
 * Şu an supkeys 3 currency destekler: TRY (₺), USD ($), EUR (€).
 */

export type Currency = "TRY" | "USD" | "EUR";

const symbols: Record<Currency, string> = {
  TRY: "₺",
  USD: "$",
  EUR: "€",
};

const localeMap: Record<Currency, string> = {
  TRY: "tr-TR",
  USD: "en-US",
  EUR: "de-DE",
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
