import { describe, expect, it } from "vitest";
import type { AiSearchIntentResult } from "@rothern/shared";
import { intentChips, intentToProductQuery, intentToRequestQuery } from "../ai-search";

const base: AiSearchIntentResult = {
  portal: "satinalma",
  summary: "Anladığım: 50 adet kompanzasyon panosu, İstanbul",
  query: "kompanzasyon panosu",
  category: { id: "39121500", nameTr: "Kompanzasyon panoları" },
  categoryHint: "kompanzasyon panosu",
  city: "İstanbul",
  verifiedOnly: true,
  activity: "MANUFACTURER",
  priceMax: 1500.5,
  currency: "TRY",
  quantity: 50,
  unit: "adet",
  keywords: ["kompanzasyon"],
  relaxed: [],
  relaxedCategoryName: null,
  draft: null,
  downgraded: false,
  warned: false,
};

describe("ai-search — yorum → URL süzgeci", () => {
  it("satınalma: ürün dizini şemasına yazar (adet → MOQ tavanı, fiyat tavanı)", () => {
    expect(intentToProductQuery(base)).toBe(
      "?q=kompanzasyon+panosu&kategori=39121500&sehir=%C4%B0stanbul&faaliyet=MANUFACTURER&dogrulanmis=1&fiyatMax=1500.5&moqMax=50",
    );
    expect(intentToProductQuery({ ...base, query: null, category: null, city: null, activity: null, verifiedOnly: false, priceMax: null, quantity: null })).toBe("");
  });

  it("satış: kategori SEGMENT'e iner, şehir alıcı şehri; alıcıya özgü alanlar yazılmaz", () => {
    expect(intentToRequestQuery({ ...base, portal: "satis" })).toBe("?q=kompanzasyon+panosu&kategori=39000000&sehir=%C4%B0stanbul");
  });

  it("çipler URL'de duran parçalardan; kaldırılan çip düşer", () => {
    const sp = new URLSearchParams(intentToProductQuery(base));
    expect(intentChips(base, sp).map((c) => c.param)).toEqual(["q", "kategori", "sehir", "dogrulanmis", "faaliyet", "fiyatMax", "moqMax"]);
    expect(intentChips(base, sp).find((c) => c.param === "moqMax")?.label).toBe("Min. sipariş ≤ 50 adet");
    expect(intentChips(base, sp).find((c) => c.param === "fiyatMax")?.label).toBe("Birim fiyat ≤ 1.500,5 TRY");
    sp.delete("sehir");
    sp.delete("q");
    expect(intentChips(base, sp).map((c) => c.param)).toEqual(["kategori", "dogrulanmis", "faaliyet", "fiyatMax", "moqMax"]);
    // Satışta alıcıya özgü çipler hiç çıkmaz.
    expect(intentChips({ ...base, portal: "satis" }, new URLSearchParams("q=x&kategori=39000000&dogrulanmis=1")).map((c) => c.param)).toEqual(["q", "kategori"]);
  });
});
