import {
  deepestCategoryPicks,
  expandCompanyCategorySelection,
  removeCategoryBranch,
} from "@rothern/shared";

/**
 * SEÇİM ↔ DEPOLAMA SÖZLEŞMESİ.
 *
 * Kilitlenen değişmez: kullanıcı hangi derinlikte seçerse seçsin, depolanan
 * küme ata zincirini taşır. Bu bozulursa yaprak beyan eden firma, alıcı bir üst
 * seviyede talep açtığında dar eksende eşleşmez ve sessizce segmentin tamamına
 * düşer — daralttığını sanırken genişlemiş olur.
 */
describe("expandCompanyCategorySelection", () => {
  it("yaprak seçimi L2 + L3 + L4 olarak saklanır, segment ayrı eksene gider", () => {
    const r = expandCompanyCategorySelection(["39121614"]);
    expect(r.mainIds).toEqual(["39000000"]);
    expect(r.subIds.sort()).toEqual(["39120000", "39121600", "39121614"]);
  });

  it("sınıf seçimi kendisi + ailesi olarak saklanır", () => {
    const r = expandCompanyCategorySelection(["39121600"]);
    expect(r.mainIds).toEqual(["39000000"]);
    expect(r.subIds.sort()).toEqual(["39120000", "39121600"]);
  });

  it("aynı daldaki iki yaprak ata kayıtlarını ÇOĞALTMAZ", () => {
    const r = expandCompanyCategorySelection(["39121614", "39121615"]);
    expect(r.subIds.sort()).toEqual([
      "39120000",
      "39121600",
      "39121614",
      "39121615",
    ]);
  });

  it("yaprağı olmayan 'sektör geneli' segmentleri korunur", () => {
    const r = expandCompanyCategorySelection(["39121614"], ["43000000"]);
    expect(r.mainIds.sort()).toEqual(["39000000", "43000000"]);
  });

  it("geçersiz kod sessizce atlanır — beyanı kırmaz", () => {
    const r = expandCompanyCategorySelection(["abc", "39121614"]);
    expect(r.subIds).toContain("39121614");
    expect(r.mainIds).toEqual(["39000000"]);
  });
});

describe("deepestCategoryPicks", () => {
  it("türetilmiş ataları eler, kullanıcının seçtiğini bırakır", () => {
    const { subIds } = expandCompanyCategorySelection(["39121614"]);
    expect(deepestCategoryPicks(subIds)).toEqual(["39121614"]);
  });

  it("farklı dallardaki seçimlerin hepsini döner", () => {
    const { subIds } = expandCompanyCategorySelection(["39121614", "43211500"]);
    expect(deepestCategoryPicks(subIds).sort()).toEqual([
      "39121614",
      "43211500",
    ]);
  });

  it("yalnız sınıf seçilmişse sınıfın kendisi 'seçim'dir", () => {
    const { subIds } = expandCompanyCategorySelection(["39121600"]);
    expect(deepestCategoryPicks(subIds)).toEqual(["39121600"]);
  });
});

describe("removeCategoryBranch", () => {
  it("kodu ve altındaki her şeyi çıkarır", () => {
    const { subIds } = expandCompanyCategorySelection([
      "39121614",
      "43211500",
    ]);
    const kalan = removeCategoryBranch(subIds, "39120000");
    expect(kalan.some((c) => c.startsWith("3912"))).toBe(false);
    expect(kalan).toContain("43211500");
  });

  it("kardeş dala dokunmaz", () => {
    const { subIds } = expandCompanyCategorySelection([
      "39121614",
      "39131700",
    ]);
    const kalan = removeCategoryBranch(subIds, "39121600");
    expect(kalan).toContain("39131700");
    expect(kalan).not.toContain("39121614");
  });
});
