import { describe, expect, it } from "vitest";
import { MIN_LANDING_PRODUCTS, canonicalListingListPage, canonicalProductListPage, landingIndexable, queryStringOf } from "../landing";

/* Liste/açılış sayfası SEO kuralları (2026-09-27): sayfalanmış sayfa kendi
   kanoniği, süzgeçli varyant tabana; ince açılış sayfası eşiği. */
describe("canonicalProductListPage", () => {
  it("yalnız ?sayfa=N varsa N; görünüm tercihi sayılmaz", () => {
    expect(canonicalProductListPage({ sayfa: "3" })).toBe(3);
    expect(canonicalProductListPage({ sayfa: "3", gorunum: "liste" })).toBe(3);
    expect(canonicalProductListPage({})).toBe(1);
  });

  it("başka süzgeç, arama, sıralama ya da adet varsa taban (1)", () => {
    expect(canonicalProductListPage({ sayfa: "2", q: "boru" })).toBe(1);
    expect(canonicalProductListPage({ sayfa: "2", sirala: "yeni" })).toBe(1);
    expect(canonicalProductListPage({ sayfa: "2", adet: "48" })).toBe(1);
    expect(canonicalProductListPage({ sayfa: "2", sehir: "izmir" })).toBe(1);
  });

  it("talep dizini aynı kural (`durum=hepsi` de süzgeç)", () => {
    expect(canonicalListingListPage({ sayfa: "4" })).toBe(4);
    expect(canonicalListingListPage({ sayfa: "4", durum: "hepsi" })).toBe(1);
  });
});

describe("açılış sayfası eşiği ve sorgu koruma", () => {
  it("eşik altı indekslenmez", () => {
    expect(landingIndexable(MIN_LANDING_PRODUCTS)).toBe(true);
    expect(landingIndexable(MIN_LANDING_PRODUCTS - 1)).toBe(false);
    expect(landingIndexable(0)).toBe(false);
  });

  it("308 hedefi sorguyu korur (çoklu değer dahil)", () => {
    expect(queryStringOf({ sayfa: "2", nitelik: ["a:1", "b:2"], x: undefined })).toBe("?sayfa=2&nitelik=a%3A1&nitelik=b%3A2");
    expect(queryStringOf(new URLSearchParams("sayfa=3"))).toBe("?sayfa=3");
    expect(queryStringOf({})).toBe("");
    expect(queryStringOf(undefined)).toBe("");
  });
});
