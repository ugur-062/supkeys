import {
  looksLikeProse,
  publicExcerpt,
} from "../../src/common/company/public-text-quality";

describe("public-text-quality — herkese açık metin sezgisi", () => {
  it("anlamsız harf dizisini reddeder", () => {
    expect(looksLikeProse("PSKDFMOKANDFASJNMFOJKANSFOJMAPSKDFMOKANDFASJNMFOJKANSFOJMA")).toBe(false);
  });
  it("kısa metni reddeder", () => {
    expect(looksLikeProse("Çelik boru üretiyoruz.")).toBe(false);
  });
  it("düzyazıyı kabul eder — teknik jargon dahil", () => {
    expect(
      looksLikeProse("DN50-DN600 dikişsiz çelik boru, EN 10216-2 P235GH, stoktan teslim; OSB'lere sevkiyat."),
    ).toBe(true);
  });
  it("kesit ilk iki satırı alır ve kesildiğini söyler", () => {
    const r = publicExcerpt("Birinci satır burada yeterince uzun bir cümle içeriyor.\nİkinci satır da öyle, açıklama devam ediyor.\nÜçüncü satır.");
    expect(r.truncated).toBe(true);
    expect(r.excerpt).not.toContain("Üçüncü");
  });
  it("kısa düzyazı kesilmez", () => {
    const r = publicExcerpt("Tek satırlık ama yeterince uzun bir firma tanıtım metni yazıyoruz.");
    expect(r.truncated).toBe(false);
    expect(r.excerpt).toBe("Tek satırlık ama yeterince uzun bir firma tanıtım metni yazıyoruz.");
  });
  it("uzun satır sözcük sınırında kesilir", () => {
    const r = publicExcerpt("kelime ".repeat(60).trim(), 50);
    expect(r.truncated).toBe(true);
    expect(r.excerpt?.endsWith("…")).toBe(true);
    expect(r.excerpt?.length).toBeLessThanOrEqual(51);
  });
});
