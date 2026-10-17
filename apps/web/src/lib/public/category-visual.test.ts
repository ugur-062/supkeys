import { Shield } from "lucide-react";
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
    expect(categoryVisual(["abc", "", "47000000"]).tone).toBe("rose");
  });

  // 2026-10-09: görselsiz eski ürün gizli segmentin ikonuyla (geri dönüşüm,
  // fide…) çizilirse gizlediğimiz kategoriyi resimle söylemiş oluruz.
  it("gizli segment kodu YOK sayılır: nötr yedek; listede görünür kod varsa o kazanır", () => {
    const neutral = categoryVisual([]);
    for (const hidden of ["92101500", "92000000", "10151500", "77101500", "50000000"]) {
      expect(categoryVisual([hidden]), hidden).toEqual(neutral);
    }
    expect(categoryVisual(["77101500", "39122200"])).toEqual(categoryVisual(["39122200"]));
  });

  // 2026-10-10: 46 "İş Güvenliği ve Yangın Ekipmanları" görünür sektördür ve
  // kendi ikonunu (kalkan) taşır. Silah / kolluk dalları gizli: kod segmente
  // inmeden ÖNCE sınanır — gizli daldaki eski ürün kalkanla çizilmez.
  it("46 görünür: segment ve görünür dalları kalkan ikonunu alır; gizli ailesi ve gizli sınıfı nötr yedeğe düşer", () => {
    const neutral = categoryVisual([]);
    const sector = categoryVisual(["46000000"]);
    expect(sector.icon).toBe(Shield);
    expect(sector).not.toEqual(neutral);
    for (const visible of ["46181500", "46180000", "46191600", "46211500"]) {
      expect(categoryVisual([visible]), visible).toEqual(sector);
    }
    for (const hidden of ["46101500", "46100000", "46151600", "46201000", "46220000", "46182500", "46182501"]) {
      expect(categoryVisual([hidden]), hidden).toEqual(neutral);
    }
    // Gizli dal atlanır; sıradaki görünür kod kazanır.
    expect(categoryVisual(["46101500", "39122200"])).toEqual(categoryVisual(["39122200"]));
    expect(categoryVisual(["46182501", "46181500"])).toEqual(sector);
  });

  it("tablo 58 segmentin tamamını tutmaya devam eder (gizleme tabloyu küçültmez)", () => {
    expect(MAPPED_SEGMENTS).toHaveLength(58);
    expect(MAPPED_SEGMENTS).toEqual(expect.arrayContaining(["46", "77", "10"]));
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
