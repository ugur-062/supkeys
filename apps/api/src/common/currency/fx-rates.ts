import {
  CURRENCY_CODES,
  currencyForLocale,
  defaultCurrencyForCountry,
  isCurrencyCode,
  type CurrencyCode,
} from "@rothern/shared";

/**
 * KUR TABLOSU — bellek içi, SENKRON okuma (2026-09-27, uluslararası tur).
 *
 * `ExchangeRateService` açılışta ve her kur çekiminden sonra en güncel TCMB
 * kurlarını `setFxRates` ile buraya yazar; saf fonksiyonlar (ürün dizini
 * süzgeci/histogramı, pano ve rapor çevrimi) `fxRate()` ile okur — çağrı
 * imzaları asenkron olmak zorunda kalmaz (şehir dizini `geoIndex()` ile aynı
 * kalıp). Yüklenmeden önce (açılış anı, birim testleri) YEDEK kurlar döner.
 *
 * YALNIZ gösterim/karşılaştırma içindir. Para yolu (teklif damgası, taban
 * kıyası) `ExchangeRateService.getFreshRate` kullanır — bayat/yok kurda
 * fail-closed; bu tablo oraya GİRMEZ.
 */

/**
 * TCMB erişilemezken / tablo boşken kullanılan koruma kurları (1 birim = X TRY;
 * 2026 ortalama tahminleri, USD≈34 ölçeğinde). İlk kur çekimi üzerine yazar.
 */
export const FALLBACK_RATES: Record<Exclude<CurrencyCode, "TRY">, number> = {
  USD: 34,
  EUR: 37,
  GBP: 43,
  CHF: 38,
  JPY: 0.23,
  AED: 9.25,
  CNY: 4.75,
  RUB: 0.6,
  AZN: 20,
  SEK: 3.2,
  NOK: 3.1,
  DKK: 5,
  BGN: 18.9,
  RON: 7.4,
  KRW: 0.025,
  SAR: 9.07,
  QAR: 9.34,
  KWD: 111,
  AUD: 22,
  CAD: 24.6,
};

let loaded: Partial<Record<string, number>> = {};

/** Kur tablosunu yazar (1 birim = X TRY). Geçersiz değer yok sayılır. */
export function setFxRates(rates: Partial<Record<string, number>>): void {
  const next: Partial<Record<string, number>> = {};
  for (const [code, v] of Object.entries(rates)) {
    if (typeof v === "number" && Number.isFinite(v) && v > 0) next[code] = v;
  }
  loaded = next;
}

/** Test kolaylığı — yedek kurlara döner. */
export function resetFxRates(): void {
  loaded = {};
}

/** 1 birimin TRY karşılığı; tablo boşsa yedek kur, bilinmeyen kodda null. */
export function fxRate(code: string | null | undefined): number | null {
  const c = code || "TRY";
  if (c === "TRY") return 1;
  const v = loaded[c] ?? (FALLBACK_RATES as Record<string, number>)[c];
  return v != null && v > 0 ? v : null;
}

/** Tüm desteklenen birimlerin güncel TRY karşılığı (gösterim). */
export function fxRateTable(): Record<CurrencyCode, number> {
  const out = {} as Record<CurrencyCode, number>;
  for (const c of CURRENCY_CODES) out[c] = fxRate(c) ?? 1;
  return out;
}

/**
 * `amount` (from biriminde) → `to` birimi, TRY üzerinden çapraz kur
 * (kur_from / kur_to). Kur bilinmiyorsa null.
 */
export function convertAmount(amount: number, from: string, to: string): number | null {
  if (!Number.isFinite(amount)) return null;
  if (from === to) return amount;
  const a = fxRate(from);
  const b = fxRate(to);
  if (a == null || b == null) return null;
  return (amount * a) / b;
}

/**
 * Oturumsuz istek (herkese açık uç) için varsayılan para birimi: açıkça
 * verilmişse o, yoksa istek dilinden (`currencyForLocale`).
 */
export function resolveVisitorCurrency(explicit: string | null | undefined, locale: string): CurrencyCode {
  return isCurrencyCode(explicit) ? explicit : currencyForLocale(locale);
}

/**
 * Firma bağlamlı istek (panel) için varsayılan para birimi: açıkça verilmişse
 * o, yoksa firmanın ülkesinden (`defaultCurrencyForCountry`).
 */
export function resolveCompanyCurrency(explicit: string | null | undefined, country: string | null | undefined): CurrencyCode {
  if (isCurrencyCode(explicit)) return explicit;
  const c = defaultCurrencyForCountry(country);
  return isCurrencyCode(c) ? c : "USD";
}
