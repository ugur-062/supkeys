import {
  CompanyOrderStatus,
  ListingBidStatus,
  ListingDeliveryTerm,
  ListingPaymentCategory,
  ListingStatus,
} from "@rothern/db";
import type { Locale } from "@rothern/i18n";
import { sellerShipsGoods } from "@rothern/shared";
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

/**
 * Durum etiketleri — okuyucunun dilinde (arayüz testi D-357). Katalog
 * `api.domain.{listingStatus,orderStatus,bidStatus}.<KOD>` web
 * `web.domain.listingStatus` / `web.domain.orderStatus` /
 * `web.panel.trade.myBidsList.status` ile AYNI metinler: asistan modeli ham
 * kodu ("OPEN") görüp kendi çevirisini uyduruyordu ("Açık (OPEN)"), arayüz
 * "Yayında" diyordu. Bilinmeyen kod → null (çağıran ham değeri korur).
 */
const LISTING_STATUS_CODES = new Set<string>(Object.values(ListingStatus));
const ORDER_STATUS_CODES = new Set<string>(Object.values(CompanyOrderStatus));
const BID_STATUS_CODES = new Set<string>(Object.values(ListingBidStatus));

export function listingStatusLabel(code: string, locale?: Locale): string | null {
  if (!LISTING_STATUS_CODES.has(code)) return null;
  return tApi(`api.domain.listingStatus.${code}` as never, undefined, locale);
}

/**
 * Sipariş durumu — IN_DELIVERY teslim şekline duyarlı (web
 * `orderStatusMeta` ile aynı): satıcı taşımıyorsa "Teslime Hazır".
 */
export function orderStatusLabel(
  code: string,
  deliveryTerm: string | null | undefined,
  locale?: Locale,
): string | null {
  if (!ORDER_STATUS_CODES.has(code)) return null;
  const key =
    code === "IN_DELIVERY" && deliveryTerm && !sellerShipsGoods(deliveryTerm)
      ? "IN_DELIVERY_PICKUP"
      : code;
  return tApi(`api.domain.orderStatus.${key}` as never, undefined, locale);
}

export function bidStatusLabel(code: string, locale?: Locale): string | null {
  if (!BID_STATUS_CODES.has(code)) return null;
  return tApi(`api.domain.bidStatus.${code}` as never, undefined, locale);
}
