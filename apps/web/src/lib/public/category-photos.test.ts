import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CATEGORY_PHOTOS, categoryPhotoSrc, segmentPhotoSrc } from "./category-photos";
import { MAPPED_SEGMENTS } from "./category-visual";

describe("kategori fotoğrafları", () => {
  it("manifestteki her kod için dosya VAR, her dosya manifestte (ikisi ayrışmasın)", () => {
    const files = new Set(
      readdirSync(join(process.cwd(), "public/categories"))
        .filter((f) => f.endsWith(".webp"))
        .map((f) => f.replace(".webp", "")),
    );
    expect([...CATEGORY_PHOTOS].filter((c) => !files.has(c))).toEqual([]);
    expect([...files].filter((c) => !CATEGORY_PHOTOS.has(c))).toEqual([]);
  });

  it("58 segmentin hepsinin fotoğrafı var (ikon eşlemesiyle aynı küme)", () => {
    for (const seg of MAPPED_SEGMENTS) expect(CATEGORY_PHOTOS.has(`${seg}000000`)).toBe(true);
    expect(CATEGORY_PHOTOS.size).toBe(58);
  });

  it("herhangi seviyedeki koddan segment fotoğrafına iner; bilinmeyen → null", () => {
    expect(categoryPhotoSrc("23000000")).toBe("/categories/23000000.webp");
    expect(categoryPhotoSrc("23150000")).toBeNull();
    expect(segmentPhotoSrc(["23151800"])).toBe("/categories/23000000.webp");
    expect(segmentPhotoSrc(["99000000", "40171501"])).toBe("/categories/40000000.webp");
    expect(segmentPhotoSrc(["abc", ""])).toBeNull();
    expect(segmentPhotoSrc(undefined)).toBeNull();
  });

  // 2026-10-09: gizli segmentin fotoğrafı hiçbir yüzeyde verilmez — görselsiz
  // eski ürünün kartı o fotoğrafla kategoriyi adını yazmadan gösterirdi.
  it("gizli segmentin fotoğrafı verilmez (dosya ve manifest durur); sıradaki görünür kod kazanır", () => {
    expect(CATEGORY_PHOTOS.has("77000000")).toBe(true);
    expect(categoryPhotoSrc("77000000")).toBeNull();
    expect(categoryPhotoSrc("10000000")).toBeNull();
    expect(segmentPhotoSrc(["92101500"])).toBeNull();
    expect(segmentPhotoSrc(["77101500", "10151500"])).toBeNull();
    expect(segmentPhotoSrc(["77101500", "40171501"])).toBe("/categories/40000000.webp");
  });

  // 2026-10-10: 46 "İş Güvenliği ve Yangın Ekipmanları" görünür sektördür —
  // fotoğrafı (yangın söndürücü) verilir. Silah / kolluk dalları gizli kalır:
  // kod segmente yuvarlanmadan ÖNCE sınanır, yoksa `46101500` görünür
  // `46000000` sayılıp gizli daldaki ürün sektörün fotoğrafını alırdı.
  it("46 görünür: segmentin ve görünür dallarının fotoğrafı verilir; gizli ailesi ve gizli sınıfı almaz", () => {
    expect(categoryPhotoSrc("46000000")).toBe("/categories/46000000.webp");
    for (const visible of ["46000000", "46181500", "46180000", "46191600", "46211500"]) {
      expect(segmentPhotoSrc([visible]), visible).toBe("/categories/46000000.webp");
    }
    for (const hidden of ["46101500", "46100000", "46151600", "46201000", "46220000", "46182500", "46182501"]) {
      expect(segmentPhotoSrc([hidden]), hidden).toBeNull();
    }
    // Gizli dal atlanır, sıradaki görünür kod kazanır (aynı sektörden olsa da).
    expect(segmentPhotoSrc(["46101500", "40171501"])).toBe("/categories/40000000.webp");
    expect(segmentPhotoSrc(["46182501", "46181500"])).toBe("/categories/46000000.webp");
  });
});
