import { CURRENCY_CODES, CURRENCY_SYMBOLS, affixCurrency, currencySymbol } from "@rothern/shared";
import type { Currency, DeliveryTerm } from "./types";

/**
 * TESLİM ŞEKLİ KODLARI — form seçeneklerinin sırası (yurtiçi merdiven önce,
 * sonra Incoterm). Etiket katalogda (`web.domain.deliveryTerm.<KOD>`), okuma
 * `@/i18n/domain` `useDeliveryTermLabel`.
 */
export const DELIVERY_TERMS: readonly DeliveryTerm[] = [
  "DOMESTIC_DELIVERED",
  "DOMESTIC_PICKUP",
  "DOMESTIC_CARRIER_COLLECT",
  "DOMESTIC_ON_VEHICLE",
  "EXW",
  "FCA",
  "CPT",
  "CIP",
  "DAP",
  "DPU",
  "DDP",
  "FAS",
  "FOB",
  "CFR",
  "CIF",
];

/**
 * Para birimi sembolleri — TEK KAYNAK `@rothern/shared` `CURRENCY_SYMBOLS`
 * (2026-09-27: API bildirimleri ve e-postalar da aynı tabloyu okusun diye
 * paylaşılan pakete taşındı). Geçmiş: repoda üç ayrı tablo vardı ve CHF/AED'de
 * çelişiyordu; belirsiz semboller (JPY/CNY "¥", "kr", sağdan-sola "د.إ")
 * yerine "JP¥"/"CN¥"/ISO kodu. Para biriminin ADI sembol değildir ve dil
 * bilir → `@/i18n/domain` `useCurrencyName`.
 *
 * Sembolün sayıya göre YERİ dilden gelir (`affixCurrency`: İngilizcede önde,
 * Türkçe/Rusçada sonda) — elle `${sayı} ${sembol}` birleştirme.
 */
export const CURRENCY_SYMBOL: Record<Currency, string> = CURRENCY_SYMBOLS;

/**
 * Desteklenen para birimleri — SIRA `@rothern/shared` `CURRENCY_CODES`'tan
 * (seçicilerde TRY/USD/EUR başta).
 */
export const CURRENCIES: Currency[] = [...CURRENCY_CODES];

export { affixCurrency, currencySymbol };
