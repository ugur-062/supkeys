import { describe, expect, it } from "vitest";
import {
  MAPPED_SEGMENTS,
  TONE_CLASS,
  categoryVisual,
} from "./category-visual";

/** Canlı katalogdaki 58 segment kodu (Category level=1, ilk iki hane). */
const LIVE_SEGMENTS = [
  "10", "11", "12", "13", "14", "15", "20", "21", "22", "23", "24", "25",
  "26", "27", "30", "31", "32", "39", "40", "41", "42", "43", "44", "45",
  "46", "47", "48", "49", "50", "51", "52", "53", "54", "55", "56", "57",
  "60", "64", "70", "71", "72", "73", "76", "77", "78", "80", "81", "82",
  "83", "84", "85", "86", "90", "91", "92", "93", "94", "95",
];

describe("kategori görseli", () => {
  it("canlı kataloğun 58 segmentinin HEPSİ eşlenmiş", () => {
    // Eksik segment = o kategorideki her kart nötr kutuya düşer. Katalog
    // değişmiyor (Ariba sabit), o yüzden liste burada donmuş durumda.
    const missing = LIVE_SEGMENTS.filter((s) => !MAPPED_SEGMENTS.includes(s));
    expect(missing).toEqual([]);
  });

  it("fazladan segment eşlenmemiş (katalogda olmayan kod)", () => {
    const extra = MAPPED_SEGMENTS.filter((s) => !LIVE_SEGMENTS.includes(s));
    expect(extra).toEqual([]);
  });

  it("8 haneli koddan segmenti çıkarır", () => {
    const a = categoryVisual(["39122200"]);
    const b = categoryVisual(["39000000"]);
    expect(a.icon).toBe(b.icon);
    expect(a.tone).toBe("sky");
  });

  it("ilk GEÇERLİ kodu kullanır, bozuk kodları atlar", () => {
    expect(categoryVisual(["abc", "", "50000000"]).tone).toBe("rose");
  });

  it("kod yoksa/tanınmıyorsa nötr yedeğe düşer — gri kutu DEĞİL", () => {
    expect(categoryVisual([]).tone).toBe("zinc");
    expect(categoryVisual(undefined).tone).toBe("zinc");
    expect(categoryVisual(["99000000"]).tone).toBe("zinc");
  });

  it("her ton için tam Tailwind sınıfı yazılı (JIT çalışma zamanında üretemez)", () => {
    for (const [tone, c] of Object.entries(TONE_CLASS)) {
      expect(c.surface).toContain(tone === "zinc" ? "zinc-100" : `${tone}-50`);
      expect(c.icon).toContain(`${tone}-`);
    }
  });
});
