import { describe, expect, it } from "vitest";
import { SHOWCASE_ORDER, buildShowcase } from "./category-showcase";

const segments = [
  { id: "23000000", name: "Makine" },
  { id: "31000000", name: "Bileşen" },
  { id: "39000000", name: "Elektrik" },
  { id: "50000000", name: "Gıda" },
];

describe("anasayfa kategori seçkisi", () => {
  it("sıfır envanterde de ızgara dolu — küratörlü sıra", () => {
    const out = buildShowcase({ segments, counts: [], productCovers: [] });
    expect(out.map((c) => c.id)).toEqual(["23000000", "31000000", "39000000", "50000000"]);
    // 58 segmentin hepsinin fotoğrafı var — envanter sıfırken de görsel dolu.
    expect(out.every((c) => c.count === 0 && c.imageSrc === `/categories/${c.id}.webp`)).toBe(true);
  });
  it("ürünü olan kategori öne geçer, sayı taşır", () => {
    const out = buildShowcase({
      segments,
      counts: [{ id: "50000000", count: 7 }, { id: "39000000", count: 2 }],
      productCovers: [],
    });
    expect(out.map((c) => c.id).slice(0, 2)).toEqual(["50000000", "39000000"]);
    expect(out[0].count).toBe(7);
  });
  it("fotoğraf ürün kapağını EZER; fotoğrafsız segmentte kapak yaprak koddan türer, ilk kapak kazanır", () => {
    const out = buildShowcase({
      segments: [...segments, { id: "99000000", name: "Fotoğrafsız" }],
      counts: [],
      productCovers: [
        { categoryId: "39121000", image: "a.webp" },
        { categoryId: "99121000", image: "n1.webp" },
        { categoryId: "99121500", image: "n2.webp" },
        { categoryId: null, image: "x.webp" },
      ],
    });
    expect(out.find((c) => c.id === "39000000")?.imageSrc).toBe("/categories/39000000.webp");
    expect(out.find((c) => c.id === "99000000")?.imageSrc).toBe("n1.webp");
  });
  it("limit uygulanır ve tekrar yok", () => {
    const out = buildShowcase({ segments, counts: [{ id: "23000000", count: 1 }], productCovers: [], limit: 2 });
    expect(buildShowcase({ segments, counts: [], productCovers: [] })).toHaveLength(4); // varsayılan tavan 11, segment 4
    expect(out).toHaveLength(2);
    expect(new Set(out.map((c) => c.id)).size).toBe(2);
  });
  it("küratörlü sıra 8 haneli segment kodlarından oluşur", () => {
    for (const code of SHOWCASE_ORDER) expect(code).toMatch(/^\d{2}000000$/);
  });
});
