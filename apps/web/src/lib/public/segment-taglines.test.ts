import { LOCALES } from "@rothern/i18n";
import { createWebTranslator } from "@rothern/i18n/translator";
import { describe, expect, it } from "vitest";
import { MAPPED_SEGMENTS } from "./category-visual";
import { TAGLINE_SEGMENTS, segmentTaglineKey } from "./segment-taglines";

describe("segmentTaglineKey", () => {
  it("ikon sözlüğündeki her segmentin sloganı var (ikisi ayrışmasın)", () => {
    expect([...TAGLINE_SEGMENTS].sort()).toEqual([...MAPPED_SEGMENTS].sort());
  });
  it("alt seviye koddan segmenti türetir; bilinmeyen kod nötr anahtara düşer", () => {
    expect(segmentTaglineKey("39121614")).toBe("s39");
    expect(segmentTaglineKey("39000000")).toBe("s39");
    expect(segmentTaglineKey("99000000")).toBe("fallback");
    expect(segmentTaglineKey(undefined)).toBe("fallback");
  });
  it.each(LOCALES)("sloganlar her dilde var ve sayı/istatistik taşımaz (%s)", (locale) => {
    const t = createWebTranslator(locale);
    for (const key of [...TAGLINE_SEGMENTS.map((s) => `s${s}`), "fallback"]) {
      const text = t(`web.marketing.taglines.${key}` as never) as string;
      expect(text, key).not.toContain("web.marketing");
      expect(text, key).not.toMatch(/\d/);
    }
  });
});
