import type { ListingDetail } from "@/hooks/use-company-listings";
import { DEFAULT_FORM_VALUES, type TenderFormData } from "./form-schema";

type Currency = TenderFormData["primaryCurrency"];

/** ISO → datetime-local input ("YYYY-MM-DDTHH:mm", yerel saat). */
export function toLocalInput(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(
    d.getDate(),
  )}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** ISO → date input ("YYYY-MM-DD"). */
export function toDateInput(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * ListingDetail → wizard form (mapToInput'un tersi). Düzenle ve Kopyala
 * akışları paylaşır. `forCopy=true` ise tarih/davet gibi kopyaya taşınmaması
 * gereken alanlar boşaltılır.
 */
export function mapDetailToForm(
  l: ListingDetail,
  opts?: { forCopy?: boolean },
): TenderFormData {
  const forCopy = opts?.forCopy ?? false;
  const allowed = (l.allowedCurrencies ?? []).filter(Boolean) as Currency[];
  const primary = (l.primaryCurrency as Currency) ?? "TRY";
  return {
    ...DEFAULT_FORM_VALUES,
    listingType: (l.type as TenderFormData["listingType"]) ?? "ALIM",
    minPrice: l.minPrice != null ? Number(l.minPrice) : undefined,
    buyNowPrice: l.buyNowPrice != null ? Number(l.buyNowPrice) : undefined,
    categoryIds: l.categoryIds ?? [],
    title: forCopy ? `${l.title} (kopya)` : l.title,
    description: l.description ?? "",
    keywords: l.keywords ?? [],
    type: (l.format as TenderFormData["type"]) ?? "RFQ",
    isInternational: l.isInternational,
    targetCountries: l.targetCountries ?? [],
    deliveryAddressId: l.deliveryAddressId ?? undefined,
    billingAddressId: l.billingAddressId ?? undefined,
    visibility: l.visibility === "PUBLIC" ? "PUBLIC" : "PRIVATE",
    isLogistics: l.isLogistics ?? false,
    logistics: {
      ...DEFAULT_FORM_VALUES.logistics,
      ...((l.logistics as Record<string, unknown> | null) ?? {}),
    },
    isSealedBid: l.isSealedBid ?? true,
    requireAllItems: l.requireAllItems ?? false,
    requireBidDocument: l.requireBidDocument ?? false,
    primaryCurrency: primary,
    allowedCurrencies: allowed.length > 0 ? allowed : [primary],
    deliveryTerm:
      (l.deliveryTerm as TenderFormData["deliveryTerm"]) ?? undefined,
    paymentTerm: (l.paymentTerm as TenderFormData["paymentTerm"]) ?? "CASH",
    paymentDays: l.paymentDays ?? undefined,
    paymentTiming:
      (l.paymentTiming as TenderFormData["paymentTiming"]) ?? "AFTER_DELIVERY",
    termsAndConditions: l.terms ?? "",
    internalNotes: l.internalNotes ?? "",
    // Kopyada tarihler boş (kullanıcı yeniden seçer).
    bidsCloseAt: forCopy ? "" : toLocalInput(l.closesAt),
    bidsOpenAt: forCopy ? "" : toLocalInput(l.bidsOpenAt),
    bidVisibility:
      (l.bidVisibility as TenderFormData["bidVisibility"]) ?? "OWN_ONLY",
    priceDecrementType:
      (l.priceDecrementType as TenderFormData["priceDecrementType"]) ??
      undefined,
    priceDecrementValue:
      l.priceDecrementValue != null ? Number(l.priceDecrementValue) : undefined,
    priceDecrementBasis:
      (l.priceDecrementBasis as TenderFormData["priceDecrementBasis"]) ??
      undefined,
    decimalPlaces: l.decimalPlaces ?? 2,
    autoExtendOnLateBid: l.autoExtendOnLateBid ?? false,
    autoExtendThresholdMin: l.autoExtendThresholdMin ?? undefined,
    autoExtendByMinutes: l.autoExtendByMinutes ?? undefined,
    items:
      l.items && l.items.length > 0
        ? l.items.map((it) => ({
            name: it.name,
            description: it.description ?? "",
            quantity: Number(it.quantity),
            unit: it.unit,
            materialCode: it.materialCode ?? "",
            requiredByDate: toDateInput(it.requiredByDate),
            targetUnitPrice:
              it.targetPrice != null ? Number(it.targetPrice) : undefined,
            customQuestion: "",
            questions: (it.questions ?? []).map((q) => ({
              id: q.id,
              text: q.text,
              answerType: q.answerType,
              required: q.required,
            })),
          }))
        : DEFAULT_FORM_VALUES.items,
    // Kopyada davetliler taşınır (aynı tedarikçi havuzu); düzenlemede de aynı.
    invitedSupplierIds: (l.invitations ?? [])
      .map((iv) => iv.supkeysId)
      .filter((s): s is string => !!s),
  };
}
