import { describe, expect, it, vi } from "vitest";

/**
 * VİTRİN KAPAĞI — SEGMENTE YUVARLAMADAN ÖNCE SÜZ (2026-10-10).
 *
 * Gizleme aile / sınıf düzeyinde de var: 46 "İş Güvenliği ve Yangın
 * Ekipmanları" görünür, silah ve kolluk dalları gizli. Fotoğrafı olmayan
 * segmentin kartı o segmentteki bir ürünün kapağını gösterir; kod önce
 * segmente yuvarlanıp sonra sınansaydı gizli daldaki ürünün (tüfek) kapağı
 * görünür sektörün kartına çıkardı. Bugün 58 segmentin hepsinin fotoğrafı var
 * (kapak hiç kullanılmıyor), o yüzden manifest burada boş sayılır.
 */
vi.mock("./category-photos", () => ({ categoryPhotoSrc: () => null }));

import { buildShowcase } from "./category-showcase";

const SEGMENTS = [
  { id: "46000000", name: "İş Güvenliği ve Yangın Ekipmanları" },
  { id: "31000000", name: "Üretim Bileşenleri" },
];
const imageOf = (out: ReturnType<typeof buildShowcase>, id: string) => out.find((c) => c.id === id)?.imageSrc;

describe("buildShowcase — ürün kapağı gizli daldan gelmez", () => {
  it("gizli ailedeki ve gizli sınıftaki ürün atlanır; görünür daldaki ilk kapak kazanır", () => {
    const out = buildShowcase({
      segments: SEGMENTS,
      counts: [],
      productCovers: [
        { categoryId: "46101500", image: "tufek.webp" },
        { categoryId: "46182501", image: "sprey.webp" },
        { categoryId: "46181500", image: "eldiven.webp" },
        { categoryId: "46191600", image: "sondurucu.webp" },
        { categoryId: "31161500", image: "vida.webp" },
      ],
    });
    expect(imageOf(out, "46000000")).toBe("eldiven.webp");
    expect(imageOf(out, "31000000")).toBe("vida.webp");
  });

  it("segmentte yalnız gizli dalda ürün varsa kart kapaksız kalır (üretilmiş görsel)", () => {
    const out = buildShowcase({
      segments: SEGMENTS,
      counts: [],
      productCovers: [
        { categoryId: "46101500", image: "tufek.webp" },
        { categoryId: "46151600", image: "kalkan.webp" },
      ],
    });
    expect(imageOf(out, "46000000")).toBeNull();
    expect(JSON.stringify(out)).not.toMatch(/tufek|kalkan/);
  });
});
