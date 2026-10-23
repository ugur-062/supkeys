import { describe, expect, it } from "vitest";
import { plainBreadcrumb } from "../category-breadcrumb";

/**
 * category-15: çip ipuçları "P. Üretim Bileşenleri › …", "AN. Mining … › …"
 * ile başlıyordu — harf Ariba'nın iç segment kodu.
 */
describe("plainBreadcrumb", () => {
  it("baştaki segment harfini atar (tek ve çift harf)", () => {
    expect(plainBreadcrumb("P. Üretim Bileşenleri ve Malzemeleri › Hırdavat › Somunlar")).toBe(
      "Üretim Bileşenleri ve Malzemeleri › Hırdavat › Somunlar",
    );
    expect(plainBreadcrumb("AN. Mining and oil and gas services › Mining services")).toBe(
      "Mining and oil and gas services › Mining services",
    );
    expect(plainBreadcrumb("BF. Земля, здания и сооружения")).toBe("Земля, здания и сооружения");
  });

  it("harf yoksa (ya da API artık yazmıyorsa) metne dokunmaz", () => {
    expect(plainBreadcrumb("Üretim Bileşenleri › Hırdavat")).toBe("Üretim Bileşenleri › Hırdavat");
    expect(plainBreadcrumb("IT. Hizmetleri")).toBe("Hizmetleri");
    expect(plainBreadcrumb("A.Ş. Malzemeleri › X")).toBe("A.Ş. Malzemeleri › X");
    expect(plainBreadcrumb("Abc. Def")).toBe("Abc. Def");
  });

  it("boş girdi boş metin döner", () => {
    expect(plainBreadcrumb(undefined)).toBe("");
    expect(plainBreadcrumb(null)).toBe("");
    expect(plainBreadcrumb("")).toBe("");
  });
});
