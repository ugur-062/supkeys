import { buildAiExtractKey, isOwnAiExtractKey } from "../../../src/modules/ai/tender-extract/ai-extract-keys";

/**
 * AI belge yükleme anahtarı: dosya adı tavana kırpılırken UZANTI korunur —
 * CSV yalnız anahtarın `.csv` ile bitmesinden tanınır (derin denetim S016).
 */
describe("buildAiExtractKey", () => {
  it("80+ karakterlik CSV adında uzantı korunur, ad 80 karakteri aşmaz", () => {
    const name = "Satinalma_Talebi_Elektrik_Malzemeleri_Listesi_Eylul_2026_Revizyon_3_Final_Onayli.csv";
    expect(name.length).toBeGreaterThan(80);
    const key = buildAiExtractKey("c1", name);
    expect(key).toMatch(/\.csv$/);
    const safe = key.split("/").pop()!.slice(37); // uuid (36) + "-"
    expect(safe.length).toBe(80);
    expect(safe.startsWith("Satinalma_Talebi")).toBe(true);
    expect(isOwnAiExtractKey(key, "c1")).toBe(true);
  });

  it("kısa ad olduğu gibi kalır; alfabe dışı karakterler '_' olur; boş ad 'file'", () => {
    expect(buildAiExtractKey("c1", "Teklif listesi.xlsx")).toMatch(/-Teklif_listesi\.xlsx$/);
    expect(buildAiExtractKey("c1", "")).toMatch(/-file$/);
  });

  it("uzantısız uzun ad düz kırpılır", () => {
    const key = buildAiExtractKey("c1", "a".repeat(120));
    expect(key.split("/").pop()!.slice(37)).toBe("a".repeat(80));
  });
});
