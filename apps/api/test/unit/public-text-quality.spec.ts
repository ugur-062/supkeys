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
  // Derin denetim S053: sesli harf sınıfı yalnız Latin'di → Latin dışı düzyazı hep reddediliyordu.
  it("Latin dışı yazılardaki düzyazıyı kabul eder (Rusça, Kazakça, Yunanca, Arapça, Çince)", () => {
    expect(looksLikeProse("Компания производит стальные трубы и фитинги для промышленности с 2005 года.")).toBe(true);
    expect(looksLikeProse("Біздің компания өнеркәсіпке арналған болат құбырлар мен фитингтер шығарады.")).toBe(true);
    expect(looksLikeProse("Η εταιρεία μας παράγει χαλύβδινους σωλήνες και εξαρτήματα για τη βιομηχανία.")).toBe(true);
    expect(looksLikeProse("شركتنا تنتج الأنابيب الفولاذية والتجهيزات للصناعة منذ عام ألفين وخمسة.")).toBe(true);
    expect(looksLikeProse("我们公司自二零零五年起为工业领域生产各种规格的无缝钢管和管件，产品远销海外多个国家和地区。")).toBe(true);
    expect(looksLikeProse("Notre société fabrique des tubes en acier été comme hiver pour l'industrie.")).toBe(true);
  });
  it("Latin dışı yazıda da gürültü ve salt rakam reddedilir", () => {
    expect(looksLikeProse("ЫВАПРОЛДЖЭЙЦУКЕНГШЩЗХЪФЫВАПРОЛДЖЭЯЧСМИТЬБЮЙЦУКЕНГШЩЗ")).toBe(false);
    expect(looksLikeProse("1234 5678 9012 3456 7890 1234 5678 9012 3456 7890")).toBe(false);
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
