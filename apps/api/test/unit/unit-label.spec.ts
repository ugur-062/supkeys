import { UNITS } from "@rothern/shared";
import { unitDisplayName } from "../../src/common/i18n/unit-label";

/**
 * Ölçü birimi etiketi okuyucunun dilinde (2026-09-27) — içe aktarma hataları
 * Rusça kullanıcıya "adet" basıyordu. Katalog `api.units.<KOD>`.
 */
describe("unitDisplayName", () => {
  it("her katalog birimi üç dilde etiket taşır; Türkçe etiket depolama adıyla (nameTr) aynı", () => {
    for (const u of UNITS) {
      expect([u.code, unitDisplayName(u.code, null, "tr")]).toEqual([u.code, u.nameTr]);
      for (const l of ["en", "ru"] as const) {
        const v = unitDisplayName(u.code, null, l);
        expect(v).not.toMatch(/api\.units/);
        expect(v.length).toBeGreaterThan(0);
      }
    }
  });

  it("örnekler", () => {
    expect(unitDisplayName("PCE", null, "en")).toBe("piece");
    expect(unitDisplayName("PCE", null, "ru")).toBe("шт.");
    expect(unitDisplayName("BAG", null, "ru")).toBe("мешок");
  });

  it("bilinmeyen kod serbest metne düşer", () => {
    expect(unitDisplayName(null, "bobin", "en")).toBe("bobin");
    expect(unitDisplayName("XYZ", " rulo-x ", "ru")).toBe("rulo-x");
    expect(unitDisplayName(null, null, "ru")).toBe("");
  });
});
