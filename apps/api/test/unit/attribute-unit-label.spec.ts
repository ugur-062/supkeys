import { attributeUnitLabel } from "../../src/common/company/category-attributes";

describe("nitelik birimi okuyucunun dilinde (çeviri denetimi 2026-09-25)", () => {
  it("Türkçe birim EN/RU'da çevrilir; Türkçede ve tanınmayan birimde aynen", () => {
    expect(attributeUnitLabel("ay", "en")).toBe("mo.");
    expect(attributeUnitLabel("ay", "ru")).toBe("мес.");
    expect(attributeUnitLabel("kişi", "ru")).toBe("чел.");
    expect(attributeUnitLabel("kW", "ru")).toBe("кВт");
    expect(attributeUnitLabel("°C", "ru")).toBe("°C");
    expect(attributeUnitLabel("ay", "tr")).toBe("ay");
    expect(attributeUnitLabel(null, "en")).toBeNull();
  });
});
