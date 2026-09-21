import { describe, expect, it } from "vitest";
import { MAPPED_SEGMENTS } from "./category-visual";
import { TAGLINE_SEGMENTS, segmentTagline } from "./segment-taglines";

describe("segmentTagline", () => {
  it("ikon sözlüğündeki her segmentin sloganı var (ikisi ayrışmasın)", () => {
    expect([...TAGLINE_SEGMENTS].sort()).toEqual([...MAPPED_SEGMENTS].sort());
  });
  it("alt seviye koddan segmenti türetir; bilinmeyen kod nötr cümleye düşer", () => {
    expect(segmentTagline("39121614")).toBe(segmentTagline("39000000"));
    expect(segmentTagline("99000000")).toBe(segmentTagline(undefined));
  });
  it("sloganlar sayı/istatistik taşımaz (uydurma sinyal yok)", () => {
    for (const s of TAGLINE_SEGMENTS) expect(segmentTagline(`${s}000000`)).not.toMatch(/\d/);
  });
});
