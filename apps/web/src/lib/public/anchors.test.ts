import { describe, expect, it } from "vitest";
import { anchorAliasIds, anchorId, categoriesHref, isCategoriesAnchor, pricingHref } from "./anchors";

describe("herkese açık çapalar dil başına (arayüz testi kapanış COPY:footer)", () => {
  it("TR adresleri aynen kalır", () => {
    expect(pricingHref("tr")).toBe("/nasil-calisir#fiyatlar");
    expect(categoriesHref("tr")).toBe("/#kategoriler");
    expect(anchorId("faq", "tr")).toBe("sss");
  });

  it("EN/RU bağlantılarında Türkçe parça yok", () => {
    expect(pricingHref("en")).toBe("/nasil-calisir#pricing");
    expect(pricingHref("ru")).toBe("/nasil-calisir#tarify");
    expect(categoriesHref("en")).toBe("/#categories");
    for (const loc of ["en", "ru"]) {
      for (const a of ["pricing", "features", "faq", "categories"] as const) {
        expect(["fiyatlar", "ozellikler", "sss", "kategoriler"]).not.toContain(anchorId(a, loc));
      }
    }
  });

  it("bilinmeyen dil Türkçeye düşer; kategori çapası her dilde tanınır", () => {
    expect(pricingHref("de")).toBe("/nasil-calisir#fiyatlar");
    expect(["kategoriler", "categories", "kategorii"].every(isCategoriesAnchor)).toBe(true);
    expect(isCategoriesAnchor("fiyatlar")).toBe(false);
  });

  it("ürün 'Bilgi iste' ve firma ürünleri çapaları dil başına; öteki diller takma ad (arayüz testi kalanlar COPY)", () => {
    expect(anchorId("inquiry", "tr")).toBe("bilgi-iste");
    expect(anchorId("products", "tr")).toBe("urunler");
    expect(anchorId("inquiry", "en")).toBe("request-info");
    expect(anchorId("products", "ru")).toBe("tovary");
    for (const loc of ["en", "ru"]) {
      expect(["bilgi-iste", "urunler"]).not.toContain(anchorId("inquiry", loc));
      expect(["bilgi-iste", "urunler"]).not.toContain(anchorId("products", loc));
      // Eski Türkçe parçalı bağlantı EN/RU sayfasında da bölüme iner.
      expect(anchorAliasIds("inquiry", loc)).toContain("bilgi-iste");
      expect(anchorAliasIds("products", loc)).toContain("urunler");
    }
    expect(anchorAliasIds("products", "tr")).toEqual(["products", "tovary"]);
  });
});
