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
 * TCMB erişilemezken / tablo boşken kullanılan koruma kurları (1 birim = X TRY).
 * TCMB 2026-09-28 döviz satış kurlarından (yayın denetimi Bölüm 7: tablo
 * "USD≈34" ölçeğinde kalmıştı, ~%30 bayattı — canlı DB boş açıldığında ilk kur
 * çekimine dek gösterim bunlarla yapılır). BGN = EUR / 1,95583 (sabit kur,
 * Bulgaristan 2026-01-01'de avroya geçti). İlk kur çekimi üzerine yazar.
 */
export const FALLBACK_RATES: Record<Exclude<CurrencyCode, "TRY">, number> = {
  USD: 48.99,
  EUR: 55.73,
  GBP: 65.06,
  CHF: 59.08,
  JPY: 0.3126,
  AED: 13.41,
  CNY: 7.339,
  RUB: 0.5837,
  AZN: 28.98,
  SEK: 4.944,
  NOK: 5.165,
  DKK: 7.467,
  BGN: 28.49,
  RON: 10.62,
  KRW: 0.0362,
  SAR: 13.05,
  QAR: 13.52,
  KWD: 160.1,
  AUD: 34.46,
  CAD: 34.64,
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
