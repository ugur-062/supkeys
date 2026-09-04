import type { ListingDetail } from "@/hooks/use-company-listings";
import {
  DEFAULT_FORM_VALUES,
  nowLocalDateTimeValue,
  type TenderFormData,
} from "./form-schema";

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
 * Faz 6.5 — kopya başlığı: "(kopya) (kopya)" zinciri yerine tek seviye
 * sayaç. "X" → "X (2)", "X (2)" → "X (3)", "X (kopya) (kopya)" → "X (2)".
 * (Başlık wizard'da düzenlenebilir — sayaç yalnız çakışmayan varsayılandır.)
 */
export function copyTitle(title: string): string {
  const base = title.replace(/(\s*\(kopya\))+\s*$/i, "").trimEnd();
  const m = base.match(/^(.*)\s\((\d+)\)$/);
  if (m) return `${m[1]} (${Number(m[2]) + 1})`;
  return `${base} (2)`;
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
    categoryIds: l.categoryIds ?? [],
    title: forCopy ? copyTitle(l.title) : l.title,
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
    // W1: CONNECTIONS de geçerli — edit'te üç değeri de koru (eski collapse
    // CONNECTIONS ilanı PRIVATE'e düşürüyordu).
    visibility:
      l.visibility === "PUBLIC"
        ? "PUBLIC"
        : l.visibility === "CONNECTIONS"
          ? "CONNECTIONS"
          : "PRIVATE",
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
    // Kopyada kapanış boş (kullanıcı yeniden seçer); açılış "şimdi" öntanımlı.
    bidsCloseAt: forCopy ? "" : toLocalInput(l.closesAt),
    bidsOpenAt: forCopy ? nowLocalDateTimeValue() : toLocalInput(l.bidsOpenAt),
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
            unitCode: it.unitCode ?? null,
            brand: it.brand ?? "",
            mpn: it.mpn ?? "",
            alternativeAllowed: it.alternativeAllowed ?? true,
            specification: it.specification ?? "",
            warrantyMonths: it.warrantyMonths ?? undefined,
            hsCode: it.hsCode ?? "",
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
      .map((iv) => iv.rothernId)
      .filter((s): s is string => !!s),
  };
}
