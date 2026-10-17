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
  it("gizli segment kendi sloganını almaz (2026-10-09) — nötr anahtar", () => {
    expect(segmentTaglineKey("92000000")).toBe("fallback");
    expect(segmentTaglineKey("77101500")).toBe("fallback");
    expect(segmentTaglineKey("10000000")).toBe("fallback");
  });
  // 2026-10-10: 46 "İş Güvenliği ve Yangın Ekipmanları" geri açıldı; silah ve
  // kolluk dalları gizli. Kod segmente inmeden ÖNCE sınanır.
  it("46 görünür: segment ve görünür dalları s46 alır; gizli ailesi ve gizli sınıfı nötr anahtara düşer", () => {
    for (const visible of ["46000000", "46181500", "46191600", "46210000"]) expect(segmentTaglineKey(visible), visible).toBe("s46");
    for (const hidden of ["46101500", "46100000", "46151600", "46220000", "46182500", "46182501"]) {
      expect(segmentTaglineKey(hidden), hidden).toBe("fallback");
    }
  });
  it.each(LOCALES)("s46 cümlesi iş güvenliğini anlatır, kolluk / silah sözcüğü taşımaz (%s)", (locale) => {
    const text = (createWebTranslator(locale)("web.marketing.taglines.s46" as never) as string).toLocaleLowerCase(locale);
    expect(text).not.toContain("web.marketing");
    expect(text).not.toMatch(/kolluk|silah|emniyet|law enforcement|weapon|police|правоохран|оружи|полици/);
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
