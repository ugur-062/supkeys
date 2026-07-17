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
    priceScope:
      (l.priceScope as TenderFormData["priceScope"]) ?? "TOPLU",
    minPrice: l.minPrice != null ? Number(l.minPrice) : undefined,
    buyNowPrice: l.buyNowPrice != null ? Number(l.buyNowPrice) : undefined,
    categoryIds: l.categoryIds ?? [],
    title: forCopy ? `${l.title} (kopya)` : l.title,
    description: l.description ?? "",
    keywords: l.keywords ?? [],
    // Kopya daima RFQ açılır — İngiliz usulü doğrudan açılamaz (tek yol
    // "Yeni Tur" aktarması); eksiltme ilanının kopyası formatı miras almaz.
    type: forCopy ? "RFQ" : ((l.format as TenderFormData["type"]) ?? "RFQ"),
    isInternational: l.isInternational,
    targetCountries: l.targetCountries ?? [],
    deliveryAddressId: l.deliveryAddressId ?? "",
    // Fatura adresi teslimattan farklıysa tik kapalı + seçim yüklenir;
    // aynıysa/boşsa tik açık (varsayılan davranış).
    billingSameAsDelivery:
      !l.billingAddressId || l.billingAddressId === l.deliveryAddressId,
    billingAddressId:
      l.billingAddressId && l.billingAddressId !== l.deliveryAddressId
        ? l.billingAddressId
        : undefined,
    visibility: l.visibility === "PUBLIC" ? "PUBLIC" : "PRIVATE",
    isLogistics: l.isLogistics ?? false,
    logistics: {
      ...DEFAULT_FORM_VALUES.logistics,
      ...((l.logistics as Record<string, unknown> | null) ?? {}),
    },
    isSealedBid: l.isSealedBid ?? true,
    requireAllItems: l.requireAllItems ?? false,
    requireBidDocument: l.requireBidDocument ?? false,
    showTargetToSuppliers: l.showTargetToSuppliers ?? false,
    primaryCurrency: primary,
    allowedCurrencies: allowed.length > 0 ? allowed : [primary],
    deliveryTerm:
      (l.deliveryTerm as TenderFormData["deliveryTerm"]) ?? undefined,
    paymentCategory:
      (l.paymentCategory as TenderFormData["paymentCategory"]) ??
      "OPEN_ACCOUNT",
    advancePercent: l.advancePercent ?? undefined,
    paymentDays: l.paymentDays ?? undefined,
    lcType: (l.lcType as TenderFormData["lcType"]) ?? undefined,
    lcConfirmed: l.lcConfirmed ?? false,
    paymentNote: l.paymentNote ?? "",
    requireGuaranteeLetter: l.requireGuaranteeLetter ?? false,
    termsAndConditions: l.terms ?? "",
    internalNotes: l.internalNotes ?? "",
    // Kopyada tarihler boş (kullanıcı yeniden seçer).
    bidsCloseAt: forCopy ? "" : toLocalInput(l.closesAt),
    bidsOpenAt: forCopy ? "" : toLocalInput(l.bidsOpenAt),
    bidVisibility:
      (l.bidVisibility as TenderFormData["bidVisibility"]) ?? "OWN_ONLY",
    decimalPlaces: l.decimalPlaces ?? 2,
    autoExtendOnLateBid: l.autoExtendOnLateBid ?? true,
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
            minUnitPrice:
              it.minUnitPrice != null ? Number(it.minUnitPrice) : undefined,
            buyNowUnitPrice:
              it.buyNowUnitPrice != null
                ? Number(it.buyNowUnitPrice)
                : undefined,
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
      .map((iv) => iv.rothernId)
      .filter((s): s is string => !!s),
  };
}
