import { categoryName, categorySlug, localizeCategoryRows } from "../../src/common/company/category-name";

/** i18n Faz 4 — kategori adı okuyucunun dilinde; çeviri yoksa Türkçeye düşer; slug HER ZAMAN Türkçe addan. */
describe("categoryName", () => {
  const row = { nameTr: "Elektrik sistemleri ve aydınlatma", nameEn: "Electrical systems and lighting", nameRu: "Электрические системы и освещение" };
  it("dile göre adı seçer", () => {
    expect(categoryName(row, "tr")).toBe(row.nameTr);
    expect(categoryName(row, "en")).toBe(row.nameEn);
    expect(categoryName(row, "ru")).toBe(row.nameRu);
  });
  it("çeviri yoksa ya da boşsa Türkçeye düşer", () => {
    expect(categoryName({ nameTr: "Vidalar" }, "en")).toBe("Vidalar");
    expect(categoryName({ nameTr: "Vidalar", nameEn: "  ", nameRu: null }, "ru")).toBe("Vidalar");
  });
  it("localizeCategoryRows nameTr'yi yerine koyar, çeviri kolonlarını yanıttan düşürür", () => {
    const out = localizeCategoryRows([{ id: "1", ...row, level: 1 }], "en");
    expect(out).toEqual([{ id: "1", nameTr: row.nameEn, level: 1 }]);
    expect("nameEn" in out[0]).toBe(false);
  });
  it("slug Türkçe addan üretilir (dilden bağımsız adres)", () => {
    expect(categorySlug("Elektrik Sistemleri ve Aydınlatma")).toBe("elektrik-sistemleri-ve-aydinlatma");
  });
});
