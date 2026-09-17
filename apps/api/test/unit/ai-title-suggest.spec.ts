import { buildTitlePrompt, sanitizeSuggestedTitle, TITLE_MAX } from "../../src/modules/ai/tender-extract/title-suggest";

/** AI talep başlığı (2026-09-17): model çıktısı temizlenir, sınırlanır; anlamsız → null. */
describe("sanitizeSuggestedTitle", () => {
  it("tırnak, satır sonu ve son noktalama temizlenir", () => {
    expect(sanitizeSuggestedTitle('"Çelik boru ve\n  bağlantı elemanları alımı."')).toBe(
      "Çelik boru ve bağlantı elemanları alımı",
    );
  });
  it("uzun çıktı sözcük sınırında kesilir", () => {
    const long = Array.from({ length: 40 }, (_, i) => `sözcük${i}`).join(" ");
    const t = sanitizeSuggestedTitle(long)!;
    expect(t.length).toBeLessThanOrEqual(TITLE_MAX);
    expect(t.endsWith("sözcük")).toBe(false);
    expect(/\s$/.test(t)).toBe(false);
  });
  it("dize değilse ya da harf içermiyorsa null", () => {
    expect(sanitizeSuggestedTitle(null)).toBeNull();
    expect(sanitizeSuggestedTitle(42)).toBeNull();
    expect(sanitizeSuggestedTitle("1234")).toBeNull();
    expect(sanitizeSuggestedTitle("ab")).toBeNull();
  });
});

describe("buildTitlePrompt", () => {
  it("kalemleri numaralı listeler, miktar varsa ekler", () => {
    const p = buildTitlePrompt([{ name: "Perçin M6", quantity: 500, unit: "adet" }, { name: "Levha" }]);
    expect(p).toContain("1. Perçin M6 — 500 adet");
    expect(p).toContain("2. Levha");
  });
});
