import { describe, expect, it } from "vitest";
import { FILTER_LIST_MAX_LENGTH, capJoinedList, cityListParam, pastEndLastPage } from "./filter-param-utils";
import { parseProductFilters, toProductListParams } from "./product-filter-params";
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
  it("Türkçe sorguyu ayrıştırır; eski `il` okunur; sıralama/ülke/süre çevrilir", () => {
    const f = parseListingFilters(new URLSearchParams("q=boru&kategori=39000000&il=İzmir&ulke=de&sure=7&sirala=kapanis&sayfa=3"));
    expect(f).toMatchObject({ q: "boru", category: "39000000", cities: ["izmir"], country: "DE", within: "7", sort: "kapanis", page: 3 });
    expect(toListingListParams(f)).toMatchObject({ type: "ALIM", city: "izmir", country: "DE", closesWithin: "7", sort: "closing", page: 3 });
    expect(activeListingFilterCount(f)).toBe(4);
  });
  it("gidiş-dönüş kararlı; geçersiz değerler düşer", () => {
    const f = parseListingFilters({ sehir: "İstanbul,Bursa", sure: "9", ulke: "xyz", sirala: "z", sayfa: "0" });
    expect(f).toEqual({ q: undefined, category: undefined, cities: ["istanbul", "bursa"], country: undefined, within: undefined, sort: undefined, state: undefined, page: 1 });
    const q = buildListingFilterQuery(f);
    expect(q).toBe("?sehir=istanbul%2Cbursa");
    expect(parseListingFilters(new URLSearchParams(q))).toEqual(f);
  });
  it("uç sınırlarına kırpar: `?sayfa=201` 200'e, uzun arama 120 karaktere iner (arayüz testi son tur webA-2)", () => {
    // Eskiden uç 400 dönüyor, ziyaretçi açık talepler varken "Alım talebi bulunamadı" görüyordu.
    expect(parseListingFilters({ sayfa: "201" }).page).toBe(200);
    expect(toListingListParams(parseListingFilters({ sayfa: "99999" })).page).toBe(200);
    expect(parseListingFilters({ q: "a".repeat(130) }).q).toHaveLength(120);
  });
});

describe("şehir değeri kalıcı adrese çevrilir (D-336, gözden geçirme)", () => {
  it("ham/katlanmış il adı facet anahtarıyla aynı kalıcı adrese iner; tekrar düşer; yabancı adres korunur", () => {
    expect(cityListParam("İstanbul,istanbul,ISTANBUL,Şanlıurfa,de-munich")).toEqual(["istanbul", "sanliurfa", "de-munich"]);
    expect(parseListingFilters({ sehir: "İzmir" }).cities).toEqual(["izmir"]);
    expect(parseCompanyFilters({ sehir: "İzmir" }).cities).toEqual(["izmir"]);
    expect(parseProductFilters({ sehir: "İzmir" }).cities).toEqual(["izmir"]);
  });
});

describe("firma dizini süzgeç URL şeması", () => {
  it("çoklu şehir/faaliyet/kategori, bayraklar ve sıralama", () => {
    const f = parseCompanyFilters(new URLSearchParams("sehir=Ankara,İzmir&faaliyet=MANUFACTURER,BOGUS&kategori=39000000,abc&dogrulanmis=1&gold=1&sirala=urun&sayfa=2"));
    expect(f).toMatchObject({ cities: ["ankara", "izmir"], activities: ["MANUFACTURER"], categories: ["39000000"], verified: true, hasProducts: false, gold: true, sort: "urun", page: 2 });
    expect(toDirectoryParams(f)).toMatchObject({ city: "ankara,izmir", activity: "MANUFACTURER", category: "39000000", verified: true, gold: true, sort: "products", page: 2 });
    expect(activeCompanyFilterCount(f)).toBe(6);
    expect(parseCompanyFilters(new URLSearchParams(buildCompanyFilterQuery(f)))).toEqual(f);
  });
  it("eski `il` parametresi okunur", () => {
    expect(parseCompanyFilters({ il: "Bursa" }).cities).toEqual(["bursa"]);
  });
});

describe("pastEndLastPage — son sayfanın ötesi (arayüz testi webA-05)", () => {
  it("toplam dolu, sayfa boş ve son sayfadan büyükse son sayfayı verir", () => {
    expect(pastEndLastPage({ itemCount: 0, total: 166, page: 200, pageSize: 24 })).toBe(7);
    expect(pastEndLastPage({ itemCount: 0, total: 166, page: 8, pageSize: 24 }, 200)).toBe(7);
  });
  it("son sayfa herkese açık sınırla kırpılır", () => {
    expect(pastEndLastPage({ itemCount: 0, total: 10_000, page: 201, pageSize: 24 }, 200)).toBe(200);
  });
  it("gerçek boş sonuçta ve dolu sayfada null (normal boş durum / liste)", () => {
    expect(pastEndLastPage({ itemCount: 0, total: 0, page: 3, pageSize: 24 })).toBeNull();
    expect(pastEndLastPage({ itemCount: 5, total: 29, page: 2, pageSize: 24 })).toBeNull();
    expect(pastEndLastPage({ itemCount: 0, total: 30, page: 1, pageSize: 24 })).toBeNull();
  });
});

/**
 * API TAVANI (gözden geçirme, 10b51394 sonrası): ana liste 404 dışındaki 4xx'te
 * hata attığı için `city` / `cert` (`@MaxLength(400)`) ve ürün `activity`
 * (`@MaxLength(200)`) tavanını aşan elle uzatılmış URL 400 → hata sayfası
 * çizerdi. Ayrıştırıcı birleşik değeri tavanda keser.
 */
describe("virgüllü liste süzgeçleri API tavanını aşmaz", () => {
  const long = (n: number) => Array.from({ length: 10 }, (_, i) => `${String(i)}${"x".repeat(n)}`).join(",");
  it("capJoinedList sırayı korur, sığmayanı ve gerisini düşürür", () => {
    expect(capJoinedList(["aa", "bb", "cc"], 5)).toEqual(["aa", "bb"]);
    expect(capJoinedList(["a".repeat(6), "b"], 5)).toEqual([]);
    expect(capJoinedList(["aa", "bb"], 5)).toEqual(["aa", "bb"]);
  });
  it("?sehir=<500 karakter> ürün, talep ve firma süzgecinde ≤ 400 birleşir", () => {
    const sehir = long(49); // 10 × 50 + 9 virgül = 509
    for (const city of [
      toProductListParams(parseProductFilters({ sehir })).city,
      toListingListParams(parseListingFilters({ sehir })).city,
      toDirectoryParams(parseCompanyFilters({ sehir })).city,
    ]) {
      expect(city!.length).toBeLessThanOrEqual(FILTER_LIST_MAX_LENGTH);
      expect(city!.split(",")).toHaveLength(7); // 7 × 50 + 6 = 356; 8. girdi 407 olurdu
    }
    expect(parseListingFilters({ sehir: "x".repeat(401) }).cities).toEqual([]);
  });
  it("?sertifika=<500 karakter> ≤ 400 birleşir; tekrarlar düşer", () => {
    const cert = toProductListParams(parseProductFilters({ sertifika: long(49) })).cert!;
    expect(cert.length).toBeLessThanOrEqual(FILTER_LIST_MAX_LENGTH);
    expect(parseProductFilters({ sertifika: "CE,CE,ISO 9001" }).certs).toEqual(["CE", "ISO 9001"]);
  });
  it("?faaliyet= içinde tekrarlanan kod düşer (API activity ≤ 200)", () => {
    const faaliyet = Array.from({ length: 10 }, () => "CONTRACT_MANUFACTURER").join(",");
    expect(toProductListParams(parseProductFilters({ faaliyet })).activity).toBe("CONTRACT_MANUFACTURER");
  });
});
