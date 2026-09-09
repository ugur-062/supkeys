import type { CreateListingInput } from "@/hooks/use-company-listings";
import type { CurrencyCode } from "@/hooks/use-company-listings";
import type { TenderFormData } from "./form-schema";

/**
 * FORM → BACKEND (CreateListingInput) — TEK KAYNAK (2026-09-09).
 * Sihirbaz ve hızlı talep kartı aynı eşlemeyi kullanır; ayrı yazılsalardı
 * biri bir alanı unutur ve o alan sessizce düşerdi (Faz 3 kalem detayları
 * tam böyle kaybolmuştu).
 */
function toIso(v: string | undefined): string | undefined {
  if (!v) return undefined;
  const d = new Date(v);
  return Number.isFinite(d.getTime()) ? d.toISOString() : undefined;
}

export function mapToInput(d: TenderFormData): CreateListingInput {
  return {
    type: "ALIM",
    // Format: RFQ / açık eksiltme.
    format: d.type,
    isInternational: d.isInternational,
    targetCountries: d.isInternational ? d.targetCountries : [],
    deliveryAddressId: d.deliveryAddressId || undefined,
    // "Fatura adresim teslimatla aynı" tiki: fatura adresi teslimat adresinden
    // kopyalanır; tik kaldırıldıysa kullanıcının seçtiği adres gider.
    billingAddressId: d.billingSameAsDelivery
      ? d.deliveryAddressId || undefined
      : d.billingAddressId || undefined,
    // W1: üç görünürlük değeri de geçerli (backend PUBLIC/CONNECTIONS/PRIVATE);
    // eski PUBLIC-veya-PRIVATE collapse'i CONNECTIONS'ı düşürüyordu.
    visibility: d.visibility,
    title: d.title.trim(),
    description: d.description?.trim() || undefined,
    closesAt: toIso(d.bidsCloseAt),
    bidsOpenAt: toIso(d.bidsOpenAt),
    items: d.items.map((it) => ({
      name: it.name.trim(),
      description: it.description?.trim() || undefined,
      quantity: it.quantity,
      unit: it.unit.trim(),
      // Faz 1: kullanıcının SEÇTİĞİ kanonik kod. Gönderilmezse servis metinden
      // türetir, ama "listede yok" kaçışında niyet kaybolurdu.
      unitCode: it.unitCode ?? undefined,
      targetPrice: it.targetUnitPrice,
      materialCode: it.materialCode?.trim() || undefined,
      // Kapak boru hattı: katalog ürününün görseli kaleme, oradan ilana.
      images: it.images?.length ? it.images : undefined,
      requiredByDate: toIso(it.requiredByDate),
      // Faz 3 — kalem detayları. Payload'a EKLENMEZSE form alanları sessizce
      // düşerdi (kullanıcı doldurur, hiçbir yere yazılmaz).
      brand: it.brand?.trim() || undefined,
      mpn: it.mpn?.trim() || undefined,
      alternativeAllowed: it.alternativeAllowed ?? undefined,
      specification: it.specification?.trim() || undefined,
      warrantyMonths: it.warrantyMonths ?? undefined,
      hsCode: it.hsCode?.trim() || undefined,
      questions: it.questions?.length
        ? it.questions.map((q) => ({
            text: q.text.trim(),
            answerType: q.answerType,
            required: q.required,
          }))
        : undefined,
    })),
    invitations: d.invitedSupplierIds?.length ? d.invitedSupplierIds : undefined,
    categoryIds: d.categoryIds,
    keywords: d.keywords,
    // Dahili not wizard'dan kaldırıldı — yayın sonrası ⋮ "İç Notlar" ile girilir.
    terms: d.termsAndConditions?.trim() || undefined,
    requireAllItems: d.requireAllItems,
    requireBidDocument: d.requireBidDocument,
    showTargetToSuppliers: d.showTargetToSuppliers,
    isSealedBid: d.isSealedBid,
    primaryCurrency: d.primaryCurrency as CurrencyCode,
    allowedCurrencies: d.allowedCurrencies as CurrencyCode[],
    deliveryTerm: d.deliveryTerm,
    // Ödeme planı — zamanlama gönderilmez, backend plandan türetir (Faz 2).
    paymentCategory: d.paymentCategory,
    advancePercent: d.advancePercent,
    paymentDays: d.paymentDays,
    lcType: d.lcType,
    lcConfirmed: d.lcConfirmed,
    paymentNote: d.paymentNote?.trim() || undefined,
    requireGuaranteeLetter: d.requireGuaranteeLetter,
    isLogistics: d.isLogistics,
    logistics: d.isLogistics ? (d.logistics as Record<string, unknown>) : undefined,
    bidVisibility: d.bidVisibility,
    decimalPlaces: d.decimalPlaces,
    autoExtendOnLateBid: d.autoExtendOnLateBid,
    autoExtendThresholdMin: d.autoExtendThresholdMin,
    autoExtendByMinutes: d.autoExtendByMinutes,
  };
}

