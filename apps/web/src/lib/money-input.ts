import { MAX_MONEY, MIN_MONEY, MONEY_DECIMALS } from "@rothern/shared";

/**
 * Ondalık basamak sınırı — backend `@IsNumber({ maxDecimalPlaces })` ile birebir.
 * Form girişleri normal ondalık gösterimdedir (exponent değil).
 */
export function maxDecimals(n: number, d: number): boolean {
  if (!Number.isFinite(n)) return false;
  const s = Math.abs(n).toString();
  if (s.includes("e") || s.includes("E")) return false;
  const dot = s.indexOf(".");
  return dot < 0 || s.length - dot - 1 <= d;
}

/**
 * Para girişi doğrulaması (imperatif formlar — teklif tutarı/birim fiyat, ödeme
 * tutarı). Backend DTO ile birebir: `min` (varsayılan 0.01) .. `MAX_MONEY`, en
 * fazla 2 ondalık. Geçerliyse `null`, değilse kullanıcı-yüzü hata mesajı.
 */
export function moneyInputError(
  value: number,
  opts: { min?: number } = {},
): string | null {
  const min = opts.min ?? MIN_MONEY;
  if (!Number.isFinite(value)) return "Geçerli bir tutar girin";
  if (value < min) return `Tutar en az ${min.toLocaleString("tr-TR")} olmalı`;
  if (value > MAX_MONEY) return "Tutar çok büyük";
  if (!maxDecimals(value, MONEY_DECIMALS)) return "En fazla 2 ondalık girin";
  return null;
}
