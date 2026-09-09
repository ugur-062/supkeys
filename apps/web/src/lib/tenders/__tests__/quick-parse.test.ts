import { describe, expect, it } from "vitest";
import { parseLine, parseNeed, titleFromItems } from "../quick-parse";

describe("hızlı talep satır ayrıştırıcı", () => {
  it("başta sayı+birim", () => {
    expect(parseLine("1200 m 3/4 inç dikişsiz çelik boru")).toEqual({ name: "3/4 inç dikişsiz çelik boru", quantity: 1200, unit: "metre", unitCode: "M" });
    expect(parseLine("1.200 metre çelik boru")).toMatchObject({ quantity: 1200, unitCode: "M" });
    expect(parseLine("50 adet dağıtım panosu 400A")).toMatchObject({ name: "dağıtım panosu 400A", quantity: 50, unit: "adet" });
  });

  it("sonda sayı+birim; ortadaki sayılar ada ait", () => {
    expect(parseLine("vida M8 x 500 adet")).toMatchObject({ name: "vida M8", quantity: 500, unitCode: "PCE" });
    expect(parseLine("çelik boru — 1200 metre")).toMatchObject({ name: "çelik boru", quantity: 1200, unitCode: "M" });
    expect(parseLine("bakır kablo 2,5 mm² 300 m")).toMatchObject({ name: "bakır kablo 2,5 mm²", quantity: 300, unitCode: "M" });
  });

  it("birimsiz: sondaki sayı adet; hiç sayı yoksa 1 adet", () => {
    expect(parseLine("çelik boru 1200")).toMatchObject({ quantity: 1200, unit: "adet" });
    expect(parseLine("forklift kiralama")).toMatchObject({ name: "forklift kiralama", quantity: 1, unit: "adet" });
  });

  it("çok satır, madde işareti ve noktalı virgül; başlık üretimi", () => {
    const items = parseNeed("- 1200 m çelik boru\n2. vida M8 x 500 adet; \n\nkonta 20 kg");
    expect(items.map((i) => i.name)).toEqual(["çelik boru", "vida M8", "konta"]);
    expect(items[2]).toMatchObject({ quantity: 20, unitCode: "KG" });
    expect(titleFromItems(items)).toBe("Çelik boru, vida M8 ve 1 kalem alımı");
    expect(titleFromItems([])).toBe("");
  });
});
