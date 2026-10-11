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
 * fazla 2 ondalık.
 *
 * i18n Faz 2: bu modül React DIŞIDIR (zod şeması da okur) → çeviremez, ANAHTAR
 * döner. Metin `web.shared.moneyInput.*` katalogundadır; çizim yerinde
 * `useMoneyInputError()` (`@/i18n/domain`) çevirir.
 */
export type MoneyInputErrorKey = "invalid" | "min" | "tooLarge" | "decimals";

export interface MoneyInputError {
  key: MoneyInputErrorKey;
  /** ICU yer tutucuları — `min` ve `decimals` mesajda geçer. */
  values: { min: number; decimals: number };
}

export function moneyInputError(
  value: number,
  opts: { min?: number } = {},
): MoneyInputError | null {
  const min = opts.min ?? MIN_MONEY;
  const values = { min, decimals: MONEY_DECIMALS };
  if (!Number.isFinite(value)) return { key: "invalid", values };
  if (value < min) return { key: "min", values };
  if (value > MAX_MONEY) return { key: "tooLarge", values };
  if (!maxDecimals(value, MONEY_DECIMALS)) return { key: "decimals", values };
  return null;
}
