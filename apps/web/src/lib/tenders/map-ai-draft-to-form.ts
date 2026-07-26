import type { AiTenderDraft } from "@rothern/shared";
import { toDateInput, toLocalInput } from "./map-detail-to-form";
import {
  DEFAULT_FORM_VALUES,
  PAYMENT_CATEGORY_VALUES,
  type TenderFormData,
} from "./form-schema";

/**
 * Faz AI-1 — AiTenderDraft (backend sanitize edilmiş ara model) →
 * TenderFormData. DEFAULT_FORM_VALUES üstüne yalnız dolu alanlar yazılır;
 * sonuç wizard'ın AYNI zodResolver'ından elle girilmiş gibi geçer (ayrı
 * doğrulama yolu yok). Kategori/adres platform-içi kimlikler — AI'dan gelmez,
 * kullanıcı wizard'da seçer.
 */
export function mapAiDraftToForm(
  draft: AiTenderDraft,
  listingType: "ALIM" | "SATIS",
): TenderFormData {
  const base: TenderFormData = {
    ...DEFAULT_FORM_VALUES,
    listingType,
    items: [],
  };

  // Enum değerleri backend sanitizer'da doğrulandı (geçmeyen null'a düştü) —
  // burada yalnız tip köprüsü yapılır; zodResolver yine de son sözü söyler.
  const currency = draft.primaryCurrency;

  const items = draft.items
    .filter((it) => it.name)
    .map((it) => ({
      name: it.name ?? "",
      description: it.description ?? "",
      quantity: it.quantity ?? 1,
      unit: it.unit ?? "adet",
      materialCode: it.materialCode ?? "",
      requiredByDate: toDateInput(it.requiredByDate),
      targetUnitPrice: it.targetUnitPrice ?? undefined,
      customQuestion: "",
      questions: [],
    }));

  return {
    ...base,
    title: draft.title ?? "",
    description: draft.description ?? "",
    keywords: draft.keywords.slice(0, 10),
    // Backend'in DB'ye karşı doğruladığı kategori önerisi — ön-seçim olarak
    // gelir, kullanıcı 2. adımda değiştirebilir. (?? []: eski oturum taslakları
    // bu alanı taşımayabilir.)
    categoryIds: (draft.suggestedCategoryIds ?? []).slice(0, 10),
    isInternational: draft.isInternational ?? false,
    primaryCurrency:
      (currency as TenderFormData["primaryCurrency"] | null) ??
      base.primaryCurrency,
    allowedCurrencies: currency
      ? [currency as TenderFormData["primaryCurrency"]]
      : base.allowedCurrencies,
    deliveryTerm:
      (draft.deliveryTerm as TenderFormData["deliveryTerm"]) ?? undefined,
    paymentCategory:
      draft.paymentCategory != null &&
      (PAYMENT_CATEGORY_VALUES as readonly string[]).includes(
        draft.paymentCategory,
      )
        ? (draft.paymentCategory as TenderFormData["paymentCategory"])
        : base.paymentCategory,
    paymentDays: draft.paymentDays ?? undefined,
    advancePercent: draft.advancePercent ?? undefined,
    bidsCloseAt: toLocalInput(draft.bidsCloseAt),
    termsAndConditions: draft.termsAndConditions ?? "",
    items: items.length > 0 ? items : DEFAULT_FORM_VALUES.items,
  };
}
