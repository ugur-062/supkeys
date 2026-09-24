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
 * Para birimi sembolleri — TEK KAYNAK (denetim Dalga B-2, P10).
 *
 * Repoda ÜÇ ayrı tablo vardı ve ikisi CHF/AED'de çelişiyordu:
 * `components/ui/money.tsx` "CHF"/"AED" (ISO kodu) derken burası ve
 * `lib/format-currency.ts` "₣"/"د.إ" diyordu — aynı tutar iki ekranda iki
 * farklı sembolle çıkıyordu. ISO kodu tercih edildi: "₣" genel frank işareti
 * (İsviçre konvansiyonu CHF) ve "د.إ" sağdan-sola yazılıp LTR tabloda hizayı
 * bozuyor. `money.tsx` ve `format-currency.ts` artık BURAYA bağlı;
 * `format-currency.ts` tümüyle kaldırıldı (ölü kod).
 *
 * Para biriminin ADI sembol değildir ve dil bilir → `@/i18n/domain`
 * `useCurrencyName` (Intl.DisplayNames).
 */
export const CURRENCY_SYMBOL: Record<Currency, string> = {
  TRY: "₺",
  USD: "$",
  EUR: "€",
  GBP: "£",
  CHF: "CHF",
  JPY: "¥",
  AED: "AED",
  CNY: "¥",
  RUB: "₽",
};

/**
 * Desteklenen para birimleri — tablodan TÜRETİLİR (dört ayrı elle yazılmış
 * liste vardı; biri güncellenip diğerleri unutulabiliyordu).
 */
export const CURRENCIES = Object.keys(CURRENCY_SYMBOL) as Currency[];

/**
 * Serbest string kod → sembol (bilinmeyen kodda kodun kendisi döner).
 * `Money`/`formatMoney` gevşek `currency: string` aldığı için gerekli.
 */
export function currencySymbol(code: string): string {
  return (CURRENCY_SYMBOL as Record<string, string>)[code] ?? code;
}
