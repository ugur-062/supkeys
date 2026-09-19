import {
  HIDDEN_SEGMENTS,
  categoryCatalogWhere,
  hiddenCategoryWhere,
  isHiddenCategory,
} from "@rothern/shared";

/**
 * KATALOG SADELEŞTİRME (2026-09-19, kullanıcı kararı): sanayi/inşaat/imalat
 * dışı 29 segment ürün arayüzünden gizli. Satır silinmez — tek kaynak
 * `HIDDEN_SEGMENTS`; seçici, arama, facet, sitemap ve doğrulama kapıları
 * aynı `where` parçasını okur.
 */
describe("gizli segmentler", () => {
  it("29 segment gizli, sanayi çekirdeği açık", () => {
    expect(HIDDEN_SEGMENTS).toHaveLength(29);
    for (const s of ["10", "42", "43", "44", "50", "51", "56", "80", "85", "94"]) {
      expect(HIDDEN_SEGMENTS).toContain(s);
    }
    for (const s of ["11", "12", "14", "21", "23", "30", "31", "39", "40", "41", "46", "72", "73", "78", "81", "95"]) {
      expect(HIDDEN_SEGMENTS).not.toContain(s);
    }
  });

  it("isHiddenCategory kodu SEGMENTİNE göre yargılar (her seviye)", () => {
    expect(isHiddenCategory("50000000")).toBe(true);
    expect(isHiddenCategory("50131700")).toBe(true); // gıda L3
    expect(isHiddenCategory("85121600")).toBe(true); // sağlık hizmeti L3
    expect(isHiddenCategory("39121600")).toBe(false); // elektrik
    expect(isHiddenCategory("23151500")).toBe(false); // üretim makinesi
    expect(isHiddenCategory(null)).toBe(false);
    expect(isHiddenCategory("")).toBe(false);
  });

  it("Prisma where parçası her gizli segment için startsWith taşır ve katalog seçimine eklenir", () => {
    const w = hiddenCategoryWhere();
    expect(w.NOT).toHaveLength(HIDDEN_SEGMENTS.length);
    expect(w.NOT).toContainEqual({ id: { startsWith: "50" } });
    expect(categoryCatalogWhere("discovery")).toEqual({ inDiscovery: true, ...w });
    expect(categoryCatalogWhere("full")).toEqual({ ...w });
  });
});
