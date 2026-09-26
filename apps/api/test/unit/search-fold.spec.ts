import { foldSearchText, stemPrefix } from "@rothern/shared";

describe("search-fold — stemPrefix", () => {
  it("Türkçe ek toleransı değişmedi", () => {
    expect(stemPrefix("borulari")).toBe("boru");
    expect(stemPrefix("sistemleri")).toBe("sistem");
    expect(stemPrefix("kablolar")).toBe("kablo");
    expect(stemPrefix("elektrik")).toBe("elektrik");
    expect(stemPrefix("pres")).toBe("pres");
  });

  it("İngilizce çoğul (i18n arama)", () => {
    expect(stemPrefix("pipes")).toBe("pipe");
    expect(stemPrefix("valves")).toBe("valve");
    expect(stemPrefix("boxes")).toBe("box");
    expect(stemPrefix("batteries")).toBe("batter");
    expect(stemPrefix("glass")).toBe("glass");
    expect(stemPrefix("cactus")).toBe("cactus");
    expect(stemPrefix("pipe")).toBe("pipe");
  });

  it("Kiril katlama iki tarafta aynı (ё/й)", () => {
    expect(foldSearchText("Стальная ТРУБА")).toBe("стальная труба");
    expect(foldSearchText("ёлка")).toBe(foldSearchText("ЁЛКА"));
  });
});
