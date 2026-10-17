import { describe, expect, it } from "vitest";
import { TR_PROVINCES, TR_PROVINCE_NAMES_I18N } from "@rothern/shared";
import { cityDisplayName } from "../domain";

describe("cityDisplayName — il adları üç dilde", () => {
  it("81 ilin hepsinin İngilizce ve Rusça karşılığı var, Rusça Kiril", () => {
    for (const p of TR_PROVINCES) {
      const names = TR_PROVINCE_NAMES_I18N[p.name];
      expect(names, p.name).toBeDefined();
      expect(names!.en.trim().length, p.name).toBeGreaterThan(1);
      expect(/^[Ѐ-ӿ\s-]+$/.test(names!.ru), `${p.name} ru=${names!.ru}`).toBe(true);
      expect(names!.en.includes("İ"), `${p.name} en=${names!.en}`).toBe(false);
    }
    expect(Object.keys(TR_PROVINCE_NAMES_I18N)).toHaveLength(TR_PROVINCES.length);
  });

  it("İngilizce: Istanbul / Izmir; Rusça: Стамбул; Türkçede ham metin", () => {
    expect(cityDisplayName("İstanbul", "en")).toBe("Istanbul");
    expect(cityDisplayName("İzmir", "en")).toBe("Izmir");
    expect(cityDisplayName("İstanbul", "ru")).toBe("Стамбул");
    expect(cityDisplayName("İstanbul", "tr")).toBe("İstanbul");
    expect(cityDisplayName("istanbul", "tr")).toBe("istanbul");
  });

  it("serbest yazım çözülür (büyük harf, aksansız), tanınmayan şehir olduğu gibi döner", () => {
    expect(cityDisplayName("IZMIR", "ru")).toBe("Измир");
    expect(cityDisplayName("sanliurfa", "en")).toBe("Şanlıurfa");
    expect(cityDisplayName("Moskova", "en")).toBe("Moskova");
    expect(cityDisplayName("Dubai", "ru")).toBe("Dubai");
    expect(cityDisplayName(null, "en")).toBe("");
    expect(cityDisplayName("  ", "ru")).toBe("");
  });
});
