import { describe, expect, it } from "vitest";
import { activeFilterCount, buildProductFilterQuery, parseProductFilters, toProductListParams } from "./product-filter-params";

describe("ürün süzgeç URL şeması", () => {
  it("Türkçe sorguyu ayrıştırır: çoklu şehir/faaliyet, aralık, sıralama", () => {
    const f = parseProductFilters({ q: " pano ", kategori: "39000000", sehir: "İstanbul,İzmir", faaliyet: "MANUFACTURER,hacker", dogrulanmis: "1", fiyat: "var", fiyatMin: "100", fiyatMax: "abc", moqMax: "50", sirala: "fiyat-azalan", nitelik: ["malzeme:Çelik", "bozuk"], sayfa: "3" });
    expect(f).toEqual({ q: "pano", category: "39000000", cities: ["İstanbul", "İzmir"], activities: ["MANUFACTURER"], verified: true, price: "var", priceMin: 100, priceMax: undefined, moqMax: 50, sort: "fiyat-azalan", attrs: ["malzeme:Çelik"], page: 3 });
    expect(toProductListParams(f)).toMatchObject({ city: "İstanbul,İzmir", activity: "MANUFACTURER", verified: true, price: "has", sort: "price_desc", page: 3 });
  });
  it("yoldan gelen kategori sorgudakini ezer; eski `il` parametresi okunur", () => {
    expect(parseProductFilters({ kategori: "11000000", il: "Bursa" }, "39000000")).toMatchObject({ category: "39000000", cities: ["Bursa"] });
  });
  it("kurucu ↔ ayrıştırıcı gidiş-dönüş kararlı", () => {
    const f = parseProductFilters({ sehir: "İzmir", sirala: "yeni", nitelik: "a:b", sayfa: "2" });
    const q = buildProductFilterQuery(f);
    expect(parseProductFilters(new URLSearchParams(q))).toEqual(f);
    expect(buildProductFilterQuery(parseProductFilters({}))).toBe("");
  });
  it("aktif süzgeç sayısı arama/sıralama/sayfayı saymaz", () => {
    expect(activeFilterCount(parseProductFilters({ q: "x", sirala: "yeni", sayfa: "2", sehir: "A,B", dogrulanmis: "1" }))).toBe(3);
  });
});
