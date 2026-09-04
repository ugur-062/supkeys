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
});
