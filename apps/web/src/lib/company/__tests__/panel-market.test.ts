import { describe, expect, it } from "vitest";
import { panelCategoryPath, panelProductPath, parsePanelCategoryCode } from "../panel-market";

describe("panel pazar rotaları", () => {
  it("kategori yolu kodu ÖNDE taşır ve geri okunur", () => {
    const href = panelCategoryPath("39000000", "Elektrik Sistemleri");
    expect(href).toBe("/company/satinalma/kategori/39000000-elektrik-sistemleri");
    expect(parsePanelCategoryCode("39000000-elektrik-sistemleri")).toBe("39000000");
  });

  it("adı 8 haneyle biten kategori yanlış kod vermez (kod önde olmasının sebebi)", () => {
    // Ad sonda olsaydı "…-39000000" kuyruğu koda benzerdi.
    expect(parsePanelCategoryCode("42000000-tibbi-cihaz-39000000")).toBe("42000000");
  });

  it("adsız kod da geçerli yol üretir", () => {
    expect(panelCategoryPath("42000000")).toBe("/company/satinalma/kategori/42000000");
  });

  it("ürün yolu firma ve ürün slug'ını kodlar", () => {
    expect(panelProductPath("trakya pano", "400-kvar")).toBe(
      "/company/satinalma/urunler/trakya%20pano/400-kvar",
    );
  });
});
