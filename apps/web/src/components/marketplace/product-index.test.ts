/**
 * Türkçe URL → İngilizce API sınırı (ürün dizini).
 *
 * Bu çeviri TEK yerde yaşıyor; sayfalar ham `searchParams` görmüyor. Test,
 * ziyaretçinin uydurduğu bir parametrenin sorguya sızmadığını ve nitelik
 * süzgecinin sınırlarının korunduğunu kilitler.
 */
import { describe, expect, it } from "vitest";
import { toProductParams } from "./product-index";

describe("toProductParams", () => {
  it("Türkçe anahtarları API sözleşmesine çevirir", () => {
    expect(
      toProductParams({ q: " boru ", il: "İstanbul", sayfa: "3" }),
    ).toEqual({ q: "boru", category: undefined, city: "İstanbul", page: 3 });
  });

  it("kategori YOLDAN gelir, sorgudan değil", () => {
    expect(toProductParams({}, "39000000").category).toBe("39000000");
    // 8 hane olmayan kod sessizce düşer.
    expect(toProductParams({}, "39").category).toBeUndefined();
  });

  it("nitelik süzgeci tekil de dizi de gelebilir", () => {
    expect(toProductParams({ nitelik: "malzeme:Çelik" }).attr).toEqual([
      "malzeme:Çelik",
    ]);
    expect(
      toProductParams({ nitelik: ["malzeme:Çelik", "standart:EN"] }).attr,
    ).toEqual(["malzeme:Çelik", "standart:EN"]);
  });

  it("ayraçsız nitelik düşer, tavan 6", () => {
    expect(toProductParams({ nitelik: ["malzeme"] }).attr).toBeUndefined();
    const many = Array.from({ length: 10 }, (_, i) => `a${i}:v`);
    expect(toProductParams({ nitelik: many }).attr).toHaveLength(6);
  });

  it("değerdeki iki nokta korunur — bölmez", () => {
    // "10:1" gibi bir oran değeri anahtarın parçası sanılmamalı.
    expect(toProductParams({ nitelik: "oran:10:1" }).attr).toEqual(["oran:10:1"]);
  });

  it("birinci sayfa parametreye yazılmaz", () => {
    expect(toProductParams({ sayfa: "1" }).page).toBeUndefined();
    expect(toProductParams({ sayfa: "abc" }).page).toBeUndefined();
  });
});
