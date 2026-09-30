import { ListingDeliveryTerm, ListingPaymentCategory } from "@rothern/db";
import type { Locale } from "@rothern/i18n";
import { tApi } from "./i18n.service";

/**
 * Teslim şekli / ödeme şekli etiketi — okuyucunun dilinde (derin denetim
 * canlı AI). Katalog `api.domain.deliveryTerm.<KOD>` /
 * `api.domain.paymentCategory.<KOD>` web `web.domain.*` ile AYNI metinler
 * (tek sözlük). Onay kartı eskiden ham enum kodu basıyordu
 * ("OPEN_ACCOUNT", "DOMESTIC_DELIVERED"). Bilinmeyen kod olduğu gibi döner.
 */
const DELIVERY_TERM_CODES = new Set<string>(Object.values(ListingDeliveryTerm));
const PAYMENT_CATEGORY_CODES = new Set<string>(Object.values(ListingPaymentCategory));

export function deliveryTermLabel(code: string | null | undefined, locale?: Locale): string | null {
  if (!code) return null;
  if (!DELIVERY_TERM_CODES.has(code)) return code;
  return tApi(`api.domain.deliveryTerm.${code}` as never, undefined, locale);
}

export function paymentCategoryLabel(code: string | null | undefined, locale?: Locale): string | null {
  if (!code) return null;
  if (!PAYMENT_CATEGORY_CODES.has(code)) return code;
  return tApi(`api.domain.paymentCategory.${code}` as never, undefined, locale);
}
