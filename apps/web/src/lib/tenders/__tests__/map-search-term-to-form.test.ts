import { describe, expect, it } from "vitest";
import { DEFAULT_FORM_VALUES } from "../form-schema";
import { mapSearchTermToForm } from "../map-product-to-form";

describe("mapSearchTermToForm — 'Talep aç' ?q= tohumu (derin denetim S078)", () => {
  it("terim ilk kalemin adı ve başlık olur; diğer alanlar varsayılan", () => {
    const f = mapSearchTermToForm("  M6 civata ");
    expect(f?.title).toBe("M6 civata");
    expect(f?.items).toHaveLength(1);
    expect(f?.items[0]).toEqual({ ...DEFAULT_FORM_VALUES.items[0], name: "M6 civata" });
    expect(f?.categoryIds).toEqual(DEFAULT_FORM_VALUES.categoryIds);
  });
  it("boş terim tohum üretmez; uzun terim alan sınırlarında kesilir", () => {
    expect(mapSearchTermToForm("   ")).toBeNull();
    const long = "x".repeat(300);
    const f = mapSearchTermToForm(long)!;
    expect(f.title).toHaveLength(120);
    expect(f.items[0]!.name).toHaveLength(200);
  });
});
