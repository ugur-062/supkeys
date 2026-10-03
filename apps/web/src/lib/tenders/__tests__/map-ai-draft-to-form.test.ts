import type { AiTenderDraft } from "@rothern/shared";
import { describe, expect, it } from "vitest";
import { mapAiDraftToForm } from "../map-ai-draft-to-form";

function draft(over: Partial<AiTenderDraft> = {}): AiTenderDraft {
  return {
    title: "Rulman alımı",
    description: null,
    primaryCurrency: null,
    deliveryTerm: null,
    paymentCategory: null,
    paymentDays: null,
    advancePercent: null,
    bidsCloseAt: null,
    keywords: [],
    isInternational: null,
    termsAndConditions: null,
    items: [
      {
        name: "Rulman",
        description: null,
        quantity: 10,
        unit: "adet",
        materialCode: null,
        requiredByDate: null,
        targetUnitPrice: null,
      },
    ],
    pricesIncludeVat: null,
    pageSummaries: [],
    suggestedCategoryIds: [],
    ...over,
  };
}

describe("mapAiDraftToForm", () => {
  it("AI kalemleri muadil varsayılanı AÇIK gelir (derin denetim Y-16)", () => {
    const form = mapAiDraftToForm(draft());
    expect(form.items).toHaveLength(1);
    expect(form.items[0]!.alternativeAllowed).toBe(true);
  });
});
