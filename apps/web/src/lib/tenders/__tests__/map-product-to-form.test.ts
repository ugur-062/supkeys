import { describe, expect, it } from "vitest";
import { mapProductToForm } from "../map-product-to-form";

const seed = { productName: "Bakır kablo", unit: "metre", categoryId: null, keywords: [], companyName: "Acme" };

/** 2026-10-09 (W-11): gizli segmentteki eski ürünün kategorisi talebe ön-seçim olarak TAŞINMAZ. */
describe("mapProductToForm — kategori ön-seçimi", () => {
  it("görünür kategori ön-seçilir; gizli segmentteki kod taşınmaz (talep kategorisiz açılır)", () => {
    expect(mapProductToForm({ ...seed, categoryId: "39121600" }).categoryIds).toEqual(["39121600"]);
    expect(mapProductToForm({ ...seed, categoryId: "46181500" }).categoryIds).toEqual([]);
    expect(mapProductToForm({ ...seed, categoryId: "10151500" }).categoryIds).toEqual([]);
    expect(mapProductToForm(seed).categoryIds).toEqual([]);
  });
});

/** Arayüz testi O-085: ürünün birimi ad + KOD olarak taşınır; çelişkili kayıt yok. */
describe("mapProductToForm — birim", () => {
  it("birim metninden kanonik kod türetilir (metre → M), varsayılan PCE kalmaz", () => {
    const f = mapProductToForm(seed);
    expect(f.items[0]).toMatchObject({ unit: "metre", unitCode: "M" });
  });

  it("ürün kaydında kod varsa o kullanılır", () => {
    const f = mapProductToForm({ ...seed, unit: "kilo", unitCode: "KG" });
    expect(f.items[0]).toMatchObject({ unit: "kilogram", unitCode: "KG" });
    expect(f.items[0]!.unit).not.toBe("");
  });

  it("tanınmayan birim 'listede yok' olur (kod null), birim boşsa adet/PCE", () => {
    expect(mapProductToForm({ ...seed, unit: "bobin" }).items[0]).toMatchObject({ unit: "bobin", unitCode: null });
    expect(mapProductToForm({ ...seed, unit: "" }).items[0]).toMatchObject({ unit: "adet", unitCode: "PCE" });
  });
});
