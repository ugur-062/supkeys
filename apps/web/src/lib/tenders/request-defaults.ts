import {
  DOMESTIC_ONLY_PAYMENT_CATEGORIES,
  INTERNATIONAL_ONLY_PAYMENT_CATEGORIES,
  PAYMENT_CATEGORIES,
  REQUEST_DEFAULTS_FALLBACK,
  type RequestDefaults,
} from "@rothern/shared";
import { toLocalInput } from "./map-detail-to-form";
import type { TenderFormData } from "./form-schema";

/**
 * TALEP ŞARTLARI ↔ FORM köprüsü (2026-09-09, hızlı talep).
 *
 * `applyRequestDefaults`: profil → form (hızlı kart ve sihirbaz varsayılanı).
 * `defaultsFromForm`: form → profil ("bu şartları varsayılan yap").
 * İkisi de AYNI alan listesini gezer; biri eklenip diğeri unutulursa profil
 * sessizce eksik kalır — testte gidiş-dönüş eşitliği kilitli.
 */

/** Yurtiçi teslim şekilleri `DOMESTIC_` önekli; kalanı Incoterms (uluslararası). */
export function deliveryTermsFor(isInternational: boolean, all: readonly string[]): string[] {
  return all.filter((t) => (isInternational ? !t.startsWith("DOMESTIC_") : t.startsWith("DOMESTIC_")));
}

export function paymentCategoriesFor(isInternational: boolean): string[] {
  return PAYMENT_CATEGORIES.filter((c) =>
    isInternational ? !DOMESTIC_ONLY_PAYMENT_CATEGORIES.includes(c) : !INTERNATIONAL_ONLY_PAYMENT_CATEGORIES.includes(c),
  );
}

/** Kapanış = şimdi + N gün, yerel `datetime-local` biçiminde (form alanı). */
export function closesAtFromDays(days: number, now = new Date()): string {
  const d = new Date(now.getTime() + days * 86_400_000);
  // Saati gün sonuna değil, aynı saate koyar; kullanıcı ileri alabilir.
  return toLocalInput(d.toISOString());
}

export function applyRequestDefaults(base: TenderFormData, d: RequestDefaults | null, now = new Date()): TenderFormData {
  const r = d ?? REQUEST_DEFAULTS_FALLBACK;
  return {
    ...base,
    isInternational: r.isInternational,
    visibility: r.visibility as TenderFormData["visibility"],
    deliveryTerm: (r.deliveryTerm ?? undefined) as TenderFormData["deliveryTerm"],
    paymentCategory: r.paymentCategory as TenderFormData["paymentCategory"],
    paymentDays: r.paymentDays ?? undefined,
    advancePercent: r.advancePercent ?? undefined,
    lcType: (r.lcType ?? undefined) as TenderFormData["lcType"],
    primaryCurrency: r.primaryCurrency as TenderFormData["primaryCurrency"],
    allowedCurrencies: r.allowedCurrencies as TenderFormData["allowedCurrencies"],
    isSealedBid: r.isSealedBid,
    bidVisibility: r.bidVisibility as TenderFormData["bidVisibility"],
    requireAllItems: r.requireAllItems,
    requireBidDocument: r.requireBidDocument,
    bidsCloseAt: closesAtFromDays(r.closeDays, now),
    deliveryAddressId: r.deliveryAddressId ?? base.deliveryAddressId ?? "",
    billingSameAsDelivery: r.billingSameAsDelivery,
  };
}

export function defaultsFromForm(f: TenderFormData, closeDays: number): RequestDefaults {
  return {
    isInternational: f.isInternational,
    visibility: f.visibility,
    deliveryTerm: f.deliveryTerm ?? null,
    paymentCategory: f.paymentCategory,
    paymentDays: f.paymentDays ?? null,
    advancePercent: f.advancePercent ?? null,
    lcType: f.lcType ?? null,
    primaryCurrency: f.primaryCurrency,
    allowedCurrencies: f.allowedCurrencies,
    isSealedBid: f.isSealedBid,
    bidVisibility: f.bidVisibility,
    requireAllItems: f.requireAllItems,
    requireBidDocument: f.requireBidDocument,
    closeDays,
    deliveryAddressId: f.deliveryAddressId || null,
    billingSameAsDelivery: f.billingSameAsDelivery,
  };
}
