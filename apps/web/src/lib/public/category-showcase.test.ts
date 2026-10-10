import { describe, expect, it } from "vitest";
import { SHOWCASE_ORDER, buildShowcase } from "./category-showcase";
import { isHiddenCategory } from "@rothern/shared";
import { MAPPED_SEGMENTS } from "./category-visual";

const segments = [
  { id: "23000000", name: "Makine" },
  { id: "31000000", name: "Bileşen" },
  { id: "39000000", name: "Elektrik" },
  { id: "30000000", name: "İnşaat" },
];

describe("anasayfa kategori seçkisi", () => {
  it("sıfır envanterde de ızgara dolu — küratörlü sıra", () => {
    const out = buildShowcase({ segments, counts: [], productCovers: [] });
    expect(out.map((c) => c.id)).toEqual(["23000000", "31000000", "39000000", "30000000"]);
    // 58 segmentin hepsinin fotoğrafı var — envanter sıfırken de görsel dolu.
    expect(out.every((c) => c.count === 0 && c.imageSrc === `/categories/${c.id}.webp`)).toBe(true);
  });
  it("ürünü olan kategori öne geçer, sayı taşır", () => {
    const out = buildShowcase({
      segments,
      counts: [{ id: "30000000", count: 7 }, { id: "39000000", count: 2 }],
      productCovers: [],
    });
    expect(out.map((c) => c.id).slice(0, 2)).toEqual(["30000000", "39000000"]);
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
  it("küratörlü sıra 8 haneli segment kodlarından oluşur ve gizli segment içermez", () => {
    for (const code of SHOWCASE_ORDER) {
      expect(code).toMatch(/^\d{2}000000$/);
      expect(isHiddenCategory(code)).toBe(false);
    }
  });
  it("GİZLİ segment (katalog sadeleştirme 2026-09-19) API'den gelse bile vitrine girmez", () => {
    const out = buildShowcase({
      segments: [...segments, { id: "50000000", name: "Gıda" }, { id: "85000000", name: "Sağlık" }],
      counts: [{ id: "50000000", count: 99 }],
      productCovers: [],
    });
    expect(out.map((c) => c.id)).toEqual(["23000000", "31000000", "39000000", "30000000"]);
  });
  // 2026-10-09 (sahip kararı): 77 anasayfadan kalktı. Bu sınama paylaşılan
  // paketin DERLENMİŞ hâlini okur — eski derlemede kural boşa geçerdi (W-20).
  it("77 (çevre hizmetleri) gizlidir: vitrine ve küratörlü sıraya girmez", () => {
    expect(isHiddenCategory("77000000")).toBe(true);
    expect(SHOWCASE_ORDER).not.toContain("77000000");
    const out = buildShowcase({
      segments: [...segments, { id: "77000000", name: "Çevre Hizmetleri" }],
      counts: [{ id: "77000000", count: 7 }],
      productCovers: [{ categoryId: "77101500", image: "k.webp" }],
    });
    expect(out.map((c) => c.id)).toEqual(["23000000", "31000000", "39000000", "30000000"]);
  });
  // 2026-10-10 (sahip kararı): 46 "İş Güvenliği ve Yangın Ekipmanları" adıyla
  // GERİ AÇILDI; yalnız silah ve kolluk dalları gizli. Derlenmiş paketi okur.
  it("46 görünür sektördür: vitrine adıyla, sayısıyla ve kendi fotoğrafıyla girer", () => {
    expect(isHiddenCategory("46000000")).toBe(false);
    expect(isHiddenCategory("46181500")).toBe(false);
    expect(isHiddenCategory("46101500")).toBe(true);
    expect(isHiddenCategory("46182501")).toBe(true);
    const out = buildShowcase({
      segments: [...segments, { id: "46000000", name: "İş Güvenliği ve Yangın Ekipmanları", slug: "is-guvenligi-ve-yangin-ekipmanlari" }],
      counts: [{ id: "46000000", count: 40 }],
      productCovers: [],
    });
    expect(out[0]).toEqual({
      id: "46000000",
      name: "İş Güvenliği ve Yangın Ekipmanları",
      slug: "is-guvenligi-ve-yangin-ekipmanlari",
      count: 40,
      imageSrc: "/categories/46000000.webp",
    });
    expect(out).toHaveLength(5);
  });
  it("görünür segment sayısı 28'dir (58 − 30 gizli) — anasayfa hepsini çizer", () => {
    const all = Array.from({ length: 100 }, (_, i) => `${String(i).padStart(2, "0")}000000`).filter((code) => MAPPED_SEGMENTS.includes(code.slice(0, 2)));
    expect(all).toHaveLength(58);
    const visible = all.filter((code) => !isHiddenCategory(code));
    expect(visible).toHaveLength(28);
    expect(visible).toContain("46000000");
    expect(visible).not.toContain("77000000");
  });
});
