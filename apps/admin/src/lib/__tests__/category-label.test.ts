import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { HIDDEN_CATEGORY_LABEL, HIDDEN_SEGMENT_PREFIXES, isHiddenSegmentCode, productCategoryLabel } from "../category-label";

/**
 * YÖNETİMDE ÜRÜN KATEGORİSİ ETİKETİ (2026-10-09, sahip kararı: "anasayfada
 * olmayan kategori başka yerde de gösterilmesin"; arayüz denetimi W-16).
 * Gizli segmentteki kategori yönetim ekranında da ADIYLA basılmaz; personel
 * nedenini görsün diye sabit not yazılır ("—" kategorisiz sanılırdı).
 */
describe("productCategoryLabel", () => {
  it("görünür kategori adıyla; ad yoksa '—'", () => {
    expect(productCategoryLabel({ categoryId: "39000000", categoryName: "Elektrik Malzemeleri", hiddenCategory: false })).toBe(
      "Elektrik Malzemeleri",
    );
    expect(productCategoryLabel({ categoryId: "39000000", categoryName: null })).toBe("—");
    expect(productCategoryLabel({ categoryId: null, categoryName: null })).toBe("—");
    expect(productCategoryLabel({})).toBe("—");
  });

  it("API bayrağı (`hiddenCategory`) sabit notu yazdırır — ad boş gelir", () => {
    expect(productCategoryLabel({ categoryId: "46181500", categoryName: null, hiddenCategory: true })).toBe(HIDDEN_CATEGORY_LABEL);
    expect(HIDDEN_CATEGORY_LABEL).toBe("— (gizli segment)");
  });

  it("bayrağı göndermeyen eski yanıt adı gönderse de ad BASILMAZ (ikinci kat: kod)", () => {
    for (const categoryId of ["46181500", "46000000", "77101500", "10151500"]) {
      expect(productCategoryLabel({ categoryId, categoryName: "Koruyucu giysi" }), categoryId).toBe(HIDDEN_CATEGORY_LABEL);
    }
  });
});

/**
 * NÖBETÇİ — yerel kopya kaynaktan ayrışamaz. Admin `@rothern/shared`a bağlı
 * değil; gizli segment listesinin tek kaynağı
 * `packages/shared/src/constants/category-catalog.ts` `HIDDEN_SEGMENTS`. Oraya
 * segment eklenir/çıkarılırsa bu test kırmızı olur ve kopya güncellenir.
 */
describe("HIDDEN_SEGMENT_PREFIXES — paylaşılan HIDDEN_SEGMENTS ile birebir", () => {
  const source = readFileSync(
    join(__dirname, "..", "..", "..", "..", "..", "packages", "shared", "src", "constants", "category-catalog.ts"),
    "utf8",
  );
  const block = /export const HIDDEN_SEGMENTS[^=]*=\s*\[([\s\S]*?)\];/.exec(source);

  it("kaynak dosyada liste bulunur", () => {
    expect(block).not.toBeNull();
  });

  it("aynı segmentler, aynı sırayla", () => {
    const shared = [...block![1]!.matchAll(/^\s*"(\d{2})"/gm)].map((m) => m[1]);
    expect(shared.length).toBeGreaterThan(0);
    expect([...HIDDEN_SEGMENT_PREFIXES]).toEqual(shared);
  });

  it("46 (kolluk/emniyet) ve 77 (çevre hizmetleri) gizli; 39 ve 31 görünür", () => {
    expect(isHiddenSegmentCode("46000000")).toBe(true);
    expect(isHiddenSegmentCode("77101500")).toBe(true);
    expect(isHiddenSegmentCode("39121600")).toBe(false);
    expect(isHiddenSegmentCode("31000000")).toBe(false);
    expect(isHiddenSegmentCode(null)).toBe(false);
    expect(isHiddenSegmentCode("")).toBe(false);
  });
});
