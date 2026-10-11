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

describe("mapAiDraftToForm — gizli segment önerisi (2026-10-09, W-11)", () => {
  it("gizli segment kodu ön-seçime girmez; tavan (3) görünürlerden sayılır", () => {
    const form = mapAiDraftToForm(
      draft({ suggestedCategoryIds: ["46101500", "39121600", "31161500", "77101500", "40141700", "23151800"] }),
    );
    expect(form.categoryIds).toEqual(["39121600", "31161500", "40141700"]);
  });

  // 2026-10-10: 46 görünür sektör; önerilen koruyucu giysi sınıfı ön-seçilir,
  // gizli ailesi (4610) ve gizli sınıfı (461825) ön-seçime girmez.
  it("46'nın görünür sınıfı ön-seçilir; gizli ailesi ve gizli sınıfı düşer", () => {
    const form = mapAiDraftToForm(draft({ suggestedCategoryIds: ["46182501", "46181500", "46101500", "46191600"] }));
    expect(form.categoryIds).toEqual(["46181500", "46191600"]);
  });
});

describe("mapAiDraftToForm", () => {
  it("AI kalemleri muadil varsayılanı AÇIK gelir (derin denetim Y-16)", () => {
    const form = mapAiDraftToForm(draft());
    expect(form.items).toHaveLength(1);
    expect(form.items[0]!.alternativeAllowed).toBe(true);
  });
});
