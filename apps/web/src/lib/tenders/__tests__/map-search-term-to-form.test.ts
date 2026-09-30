// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_FORM_VALUES } from "../form-schema";
import { mapSearchTermToForm } from "../map-product-to-form";
import { QUICK_DRAFT_KEY, appendTermToQuickDraft } from "../quick-draft";

describe("mapSearchTermToForm — 'Talep aç' ?q= tohumu (derin denetim S078)", () => {
  it("terim ilk kalemin adı olur; başlık tohumlanmaz (kalemlerden türer); diğer alanlar varsayılan", () => {
    const f = mapSearchTermToForm("  M6 civata ");
    expect(f?.title).toBe(DEFAULT_FORM_VALUES.title);
    expect(f?.items).toHaveLength(1);
    expect(f?.items[0]).toEqual({ ...DEFAULT_FORM_VALUES.items[0], name: "M6 civata" });
    expect(f?.categoryIds).toEqual(DEFAULT_FORM_VALUES.categoryIds);
  });
  it("boş terim tohum üretmez; uzun terim alan sınırlarında kesilir", () => {
    expect(mapSearchTermToForm("   ")).toBeNull();
    const long = "x".repeat(300);
    const f = mapSearchTermToForm(long)!;
    expect(f.items[0]!.name).toHaveLength(200);
  });
});

describe("appendTermToQuickDraft — yarım taslak ?q= ile silinmez (LU-30 gözden geçirme)", () => {
  const blank = DEFAULT_FORM_VALUES.items[0]!;
  beforeEach(() => sessionStorage.clear());

  it("taslak yoksa false döner, depoya yazmaz", () => {
    expect(appendTermToQuickDraft("M6", blank)).toBe(false);
    expect(sessionStorage.getItem(QUICK_DRAFT_KEY)).toBeNull();
  });

  it("taslak varsa terim sona kalem olarak eklenir, mevcut kalemler korunur", () => {
    const draft = { title: "Bağlantı elemanları", items: [{ ...blank, name: "Rulman 6205", quantity: 40 }] };
    sessionStorage.setItem(QUICK_DRAFT_KEY, JSON.stringify(draft));
    expect(appendTermToQuickDraft(" M6 civata ", blank)).toBe(true);
    const saved = JSON.parse(sessionStorage.getItem(QUICK_DRAFT_KEY)!);
    expect(saved.title).toBe("Bağlantı elemanları");
    expect(saved.items.map((i: { name: string }) => i.name)).toEqual(["Rulman 6205", "M6 civata"]);
    expect(saved.items[0].quantity).toBe(40);
  });

  it("boş ilk kalem doldurulur; aynı adlı kalem ikinci kez eklenmez", () => {
    sessionStorage.setItem(QUICK_DRAFT_KEY, JSON.stringify({ title: "", items: [{ ...blank, name: "" }] }));
    expect(appendTermToQuickDraft("M6", blank)).toBe(true);
    expect(appendTermToQuickDraft("m6", blank)).toBe(true);
    const saved = JSON.parse(sessionStorage.getItem(QUICK_DRAFT_KEY)!);
    expect(saved.items.map((i: { name: string }) => i.name)).toEqual(["M6"]);
  });
});
