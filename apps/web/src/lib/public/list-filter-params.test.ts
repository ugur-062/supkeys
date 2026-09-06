import { describe, expect, it } from "vitest";
import {
  activeCompanyFilterCount,
  buildCompanyFilterQuery,
  parseCompanyFilters,
  toDirectoryParams,
} from "./company-filter-params";
import {
  activeListingFilterCount,
  buildListingFilterQuery,
  parseListingFilters,
  toListingListParams,
} from "./listing-filter-params";

describe("alım talebi süzgeç URL şeması", () => {
  it("Türkçe sorguyu ayrıştırır; eski `il` okunur; sıralama/kapsam/süre çevrilir", () => {
    const f = parseListingFilters(new URLSearchParams("q=boru&kategori=39000000&il=İzmir&kapsam=uluslararasi&sure=7&sirala=kapanis&sayfa=3"));
    expect(f).toMatchObject({ q: "boru", category: "39000000", cities: ["İzmir"], scope: "uluslararasi", within: "7", sort: "kapanis", page: 3 });
    expect(toListingListParams(f)).toMatchObject({ type: "ALIM", city: "İzmir", scope: "international", closesWithin: "7", sort: "closing", page: 3 });
    expect(activeListingFilterCount(f)).toBe(4);
  });
  it("gidiş-dönüş kararlı; geçersiz değerler düşer", () => {
    const f = parseListingFilters({ sehir: "İstanbul,Bursa", sure: "9", kapsam: "x", sirala: "z", sayfa: "0" });
    expect(f).toEqual({ q: undefined, category: undefined, cities: ["İstanbul", "Bursa"], scope: undefined, within: undefined, sort: undefined, state: undefined, page: 1 });
    const q = buildListingFilterQuery(f);
    expect(q).toBe("?sehir=%C4%B0stanbul%2CBursa");
    expect(parseListingFilters(new URLSearchParams(q))).toEqual(f);
  });
});

describe("firma dizini süzgeç URL şeması", () => {
  it("çoklu şehir/faaliyet/kategori, bayraklar ve sıralama", () => {
    const f = parseCompanyFilters(new URLSearchParams("sehir=Ankara,İzmir&faaliyet=MANUFACTURER,BOGUS&kategori=39000000,abc&dogrulanmis=1&gold=1&sirala=urun&sayfa=2"));
    expect(f).toMatchObject({ cities: ["Ankara", "İzmir"], activities: ["MANUFACTURER"], categories: ["39000000"], verified: true, hasProducts: false, gold: true, sort: "urun", page: 2 });
    expect(toDirectoryParams(f)).toMatchObject({ city: "Ankara,İzmir", activity: "MANUFACTURER", category: "39000000", verified: true, gold: true, sort: "products", page: 2 });
    expect(activeCompanyFilterCount(f)).toBe(6);
    expect(parseCompanyFilters(new URLSearchParams(buildCompanyFilterQuery(f)))).toEqual(f);
  });
  it("eski `il` parametresi okunur", () => {
    expect(parseCompanyFilters({ il: "Bursa" }).cities).toEqual(["Bursa"]);
  });
});
