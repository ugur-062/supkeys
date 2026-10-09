import {
  HIDDEN_SEGMENTS,
  categoryCatalogWhere,
  hiddenCategoryWhere,
  isHiddenCategory,
  visibleCategoryId,
  visibleCategoryIds,
} from "@rothern/shared";

/**
 * KATALOG SADELEŞTİRME (2026-09-19, kullanıcı kararı): sanayi/inşaat/imalat
 * dışı segmentler ürün arayüzünden gizli (sayı yorumda tutulmaz — aşağıdaki
 * test kilitler). Satır silinmez — tek kaynak `HIDDEN_SEGMENTS`; seçici,
 * arama, facet, sitemap ve doğrulama kapıları aynı `where` parçasını okur.
 *
 * 2026-10-09 (kullanıcı kararı): 46 (Kolluk, Ulusal Güvenlik ve Emniyet
 * Ekipmanları) ve 77 (Çevre Hizmetleri) de gizli → 31 gizli, 27 görünür.
 */
describe("gizli segmentler", () => {
  it("31 segment gizli, sanayi çekirdeği açık", () => {
    expect(HIDDEN_SEGMENTS).toHaveLength(31);
    expect(new Set(HIDDEN_SEGMENTS).size).toBe(31);
    for (const s of ["10", "42", "43", "44", "46", "50", "51", "56", "77", "80", "85", "94"]) {
      expect(HIDDEN_SEGMENTS).toContain(s);
    }
    // Anasayfada görünen 27 segmentin TAMAMI (kullanıcı: "anasayfada olmayan
    // kategori başka yerde de gösterilmesin" — liste iki yönde de kilitli).
    const visible = [
      "11", "12", "13", "14", "15", "30", "31", "32",
      "20", "21", "22", "23", "24", "25", "26", "27", "39", "40", "41", "47",
      "71", "72", "73", "76", "78", "81",
      "95",
    ];
    expect(visible).toHaveLength(27);
    for (const s of visible) expect(HIDDEN_SEGMENTS).not.toContain(s);
  });

  it("isHiddenCategory kodu SEGMENTİNE göre yargılar (her seviye)", () => {
    expect(isHiddenCategory("50000000")).toBe(true);
    expect(isHiddenCategory("50131700")).toBe(true); // gıda L3
    expect(isHiddenCategory("85121600")).toBe(true); // sağlık hizmeti L3
    expect(isHiddenCategory("46181700")).toBe(true); // emniyet ekipmanı L3 (2026-10-09)
    expect(isHiddenCategory("77101500")).toBe(true); // çevre hizmeti L3 (2026-10-09)
    expect(isHiddenCategory("78101800")).toBe(false); // lojistik
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

describe("saklanmış kodların gösterimi (2026-10-09: 'anasayfada olmayan kategori hiçbir yerde gösterilmez')", () => {
  it("visibleCategoryIds gizli segment kodlarını düşürür, sırayı korur, boş / null girdide boş döner", () => {
    expect(visibleCategoryIds(["46181500", "39121600", "77101500", "78101800", "10101500"])).toEqual([
      "39121600",
      "78101800",
    ]);
    expect(visibleCategoryIds([null, undefined, "", "31000000"])).toEqual(["31000000"]);
    expect(visibleCategoryIds(null)).toEqual([]);
    expect(visibleCategoryIds(undefined)).toEqual([]);
  });

  it("visibleCategoryId tek kodda aynı kuralı uygular", () => {
    expect(visibleCategoryId("46181500")).toBeNull();
    expect(visibleCategoryId("39121600")).toBe("39121600");
    expect(visibleCategoryId(null)).toBeNull();
    expect(visibleCategoryId("")).toBeNull();
  });
});
