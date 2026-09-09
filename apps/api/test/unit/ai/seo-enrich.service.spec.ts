import { SeoEnrichService } from "../../../src/modules/ai/seo-enrich/seo-enrich.service";

/**
 * Açıklama güçlendirme — sanitizer sözleşmesi: madde/emoji temizliği,
 * cümle sınırında kesme, anahtar kelime birleşimi, boş yanıtta premium
 * retry sonra dürüst 503. Model taslak üretir, yazma yok.
 */
function makeAi(texts: string[]) {
  const callAi = jest.fn();
  for (const t of texts) callAi.mockResolvedValueOnce({ text: t, downgraded: false, warned: false });
  return { assertAiAccess: jest.fn(), callAi };
}
const user = { companyId: "c1", userId: "u1", tier: "SILVER" } as never;
const LONG = "Paslanmaz çelik dirsek AISI 316 alaşımından üretilir ve gıda tesislerinde kullanılır. Kaynaklı bağlantıya uygundur. Koli içinde 50 adet sevk edilir. ".repeat(2);

describe("SeoEnrichService", () => {
  it("taslağı temizler: madde işaretleri, emoji, anahtar kelime birleşimi, uzunluk tavanı", async () => {
    const ai = makeAi([
      JSON.stringify({
        description: `- ${LONG} 🚀 ${"Ek cümle burada. ".repeat(60)}`,
        keywords: ["Dirsek", "dirsek", " DN50 ", "x"],
        titleSuggestion: "Paslanmaz çelik dirsek 90° DN50",
        missingFacts: ["ölçü", "standart", 42, "", "a", "b", "c", "d"],
      }),
    ]);
    const svc = new SeoEnrichService(ai as never);
    const r = await svc.enrich(user, { kind: "product", name: "Dirsek", keywords: ["paslanmaz"], facts: ["Malzeme: AISI 316"] });
    expect(r.description.startsWith("Paslanmaz")).toBe(true);
    expect(r.description).not.toContain("🚀");
    expect(r.description.length).toBeLessThanOrEqual(900);
    expect(/[.!?]$/.test(r.description)).toBe(true); // cümle sınırında kesildi
    expect(r.keywords.slice(0, 3)).toEqual(["paslanmaz", "dirsek", "dn50"]);
    expect(r.titleSuggestion).toBe("Paslanmaz çelik dirsek 90° DN50");
    expect(r.missingFacts).toEqual(["ölçü", "standart", "a", "b", "c"]);
    expect(ai.assertAiAccess).toHaveBeenCalled();
    const prompt = ai.callAi.mock.calls[0][1].prompt as string;
    expect(prompt).toContain("<veri>");
    expect(prompt).toContain("Malzeme: AISI 316");
  });

  it("kısa/boş yanıtta premium retry; yine boşsa 503", async () => {
    const ai = makeAi(["{}", JSON.stringify({ description: LONG, keywords: [] })]);
    const svc = new SeoEnrichService(ai as never);
    const r = await svc.enrich(user, { kind: "company", name: "Acme" });
    expect(r.description.length).toBeGreaterThan(100);
    expect(ai.callAi).toHaveBeenCalledTimes(2);
    expect(ai.callAi.mock.calls[1][1].premiumRetry).toBe(true);

    const bad = makeAi(["bozuk", "{}"]);
    await expect(new SeoEnrichService(bad as never).enrich(user, { kind: "listing", name: "Boru alımı" })).rejects.toThrow(/üretilemedi/);
  });

  it("ad yoksa 400; ad önerisi adla aynıysa null", async () => {
    const ai = makeAi([JSON.stringify({ description: LONG, keywords: [], titleSuggestion: "acme" })]);
    const svc = new SeoEnrichService(ai as never);
    await expect(svc.enrich(user, { kind: "product", name: " " })).rejects.toThrow(/ad/);
    const r = await svc.enrich(user, { kind: "product", name: "Acme" });
    expect(r.titleSuggestion).toBeNull();
  });
});
