import { describe, expect, it } from "vitest";
import { activeFilterCount, buildProductFilterQuery, clearProductFilters, parseProductFilters, productSearchCarry, toProductListParams } from "./product-filter-params";

describe("ürün süzgeç URL şeması", () => {
  it("Türkçe sorguyu ayrıştırır: çoklu şehir/faaliyet, aralık, sıralama", () => {
    const f = parseProductFilters({ q: " pano ", kategori: "39000000", sehir: "İstanbul,İzmir", faaliyet: "MANUFACTURER,hacker", dogrulanmis: "1", fiyat: "var", fiyatMin: "100", fiyatMax: "abc", moqMax: "50", sirala: "fiyat-azalan", nitelik: ["malzeme:Çelik", "bozuk"], sayfa: "3" });
    expect(f).toMatchObject({ q: "pano", category: "39000000", cities: ["İstanbul", "İzmir"], activities: ["MANUFACTURER"], verified: true, price: "var", priceMin: 100, priceMax: undefined, moqMax: 50, sort: "fiyat-azalan", attrs: ["malzeme:Çelik"], page: 3 });
    expect(toProductListParams(f)).toMatchObject({ city: "İstanbul,İzmir", activity: "MANUFACTURER", verified: true, price: "has", sort: "price_desc", page: 3 });
  });
  it("yoldan gelen kategori sorgudakini ezer; eski `il` parametresi okunur", () => {
    expect(parseProductFilters({ kategori: "11000000", il: "Bursa" }, "39000000")).toMatchObject({ category: "39000000", cities: ["Bursa"] });
  });
  it("arama formu tüm süzgeçleri taşır, arama terimini ve sayfayı taşımaz", () => {
    const f = parseProductFilters({ q: "pano", sehir: "Bursa", para: "EUR", fiyatMin: "500", fiyatMax: "2000", fiyatsizDahil: "1", moqMax: "10", sertifika: "ISO 9001", calisan: "11-50", hizli: "1", yakin: "bursa", mesafe: "100", adet: "48", nitelik: ["a:b", "c:d"], sayfa: "3" });
    const carry = productSearchCarry(f);
    expect(carry).toMatchObject({ para: ["EUR"], fiyatMin: ["500"], fiyatMax: ["2000"], fiyatsizDahil: ["1"], moqMax: ["10"], yakin: ["bursa"], mesafe: ["100"], adet: ["48"], nitelik: ["a:b", "c:d"] });
    expect(carry.q).toBeUndefined();
    expect(carry.sayfa).toBeUndefined();
    // Taşınan alanlar + yeni terim, eski durumu (terim ve sayfa hariç) geri üretir.
    const sp = new URLSearchParams();
    for (const [k, vs] of Object.entries(carry)) for (const v of vs) sp.append(k, v);
    expect(parseProductFilters(sp)).toEqual({ ...f, q: undefined, page: 1 });
  });
  it("kurucu ↔ ayrıştırıcı gidiş-dönüş kararlı", () => {
    const f = parseProductFilters({ sehir: "İzmir", sirala: "yeni", nitelik: "a:b", sayfa: "2" });
    const q = buildProductFilterQuery(f);
    expect(parseProductFilters(new URLSearchParams(q))).toEqual(f);
    expect(buildProductFilterQuery(parseProductFilters({}))).toBe("");
  });
  it("`gorunum` GÖRÜNÜM tercihidir: süzgeç sayılmaz, temizlemede KALIR, API'ye gitmez", () => {
    const f = parseProductFilters({ gorunum: "liste", sehir: "Bursa", adet: "48" });
    expect(f.view).toBe("liste");
    expect(activeFilterCount(f)).toBe(1);
    expect(clearProductFilters(f)).toMatchObject({ view: "liste", perPage: 48, cities: [] });
    expect(toProductListParams(f)).not.toHaveProperty("view");
    expect(buildProductFilterQuery(f)).toContain("gorunum=liste");
    // Bilinmeyen değer düşer (URL'den gelen her şey veri).
    expect(parseProductFilters({ gorunum: "kart" }).view).toBeUndefined();
  });

  it("`para` (2026-09-27 kurla çevir): fiyat süzgecinin birimi — tercih gibi davranır", () => {
    const f = parseProductFilters({ para: "eur", fiyatMax: "500" });
    expect(f.currency).toBe("EUR");
    // Süzgeç sayılmaz (yalnız aralık sayılır), temizlemede KALIR.
    expect(activeFilterCount(f)).toBe(1);
    expect(clearProductFilters(f).currency).toBe("EUR");
    expect(clearProductFilters(f).priceMax).toBeUndefined();
    expect(buildProductFilterQuery(f)).toContain("para=EUR");
    expect(toProductListParams(f)).toMatchObject({ currency: "EUR", priceMax: 500 });
    // URL'de yoksa çağıranın varsayılanı (herkese açık sayfa dilden verir).
    expect(toProductListParams(parseProductFilters({}), { defaultCurrency: "USD" }).currency).toBe("USD");
    expect(toProductListParams(parseProductFilters({})).currency).toBeUndefined();
    // Bilinmeyen kod düşer.
    expect(parseProductFilters({ para: "XYZ" }).currency).toBeUndefined();
    // Gidiş-dönüş kararlı.
    expect(parseProductFilters(new URLSearchParams(buildProductFilterQuery(f)))).toEqual(f);
  });

  it("aktif süzgeç sayısı arama/sıralama/sayfayı saymaz", () => {
    expect(activeFilterCount(parseProductFilters({ q: "x", sirala: "yeni", sayfa: "2", sehir: "A,B", dogrulanmis: "1" }))).toBe(3);
  });

  it("2026-09-07 grupları: sertifika, çalışan kovası, fiyatsız dahil", () => {
    const f = parseProductFilters({ sertifika: "ISO 9001,CE", calisan: "10,50,999", fiyatMin: "100", fiyatsizDahil: "1" });
    expect(f.certs).toEqual(["ISO 9001", "CE"]);
    // Bilinmeyen kova anahtarı DÜŞER (URL elle düzenlenmiş olabilir).
    expect(f.employees).toEqual([10, 50]);
    expect(f.priceUnpriced).toBe(true);
    // Her biri ayrı bir aktif süzgeç: 2 sertifika + 2 kova + 1 fiyat aralığı.
    expect(activeFilterCount(f)).toBe(5);
    expect(toProductListParams(f)).toMatchObject({
      cert: "ISO 9001,CE",
      employees: "10,50",
      priceUnpriced: true,
    });
    // Gidiş-dönüş kararlı.
    expect(parseProductFilters(new URLSearchParams(buildProductFilterQuery(f)))).toEqual(f);
  });

  it("Yakınımda: merkez + yarıçap İKİSİ birlikte anlamlı", () => {
    const f = parseProductFilters({ yakin: "İzmir", mesafe: "50" });
    expect(f.near).toBe("İzmir");
    expect(f.radius).toBe(50);
    expect(activeFilterCount(f)).toBe(1);
    expect(toProductListParams(f)).toMatchObject({ near: "İzmir", radius: 50 });
    expect(parseProductFilters(new URLSearchParams(buildProductFilterQuery(f)))).toEqual(f);

    // Yarım kısıt UYGULANMAZ: yalnız merkez ya da yalnız yarıçap → API'ye
    // gitmez ve URL'e yazılmaz (aksi hâlde liste sessizce boşalırdı).
    const onlyNear = parseProductFilters({ yakin: "İzmir" });
    expect(activeFilterCount(onlyNear)).toBe(0);
    expect(toProductListParams(onlyNear).near).toBeUndefined();
    expect(buildProductFilterQuery(onlyNear)).toBe("");

    // Listede olmayan yarıçap düşer (10 km bilinçli olarak yok).
    expect(parseProductFilters({ yakin: "İzmir", mesafe: "10" }).radius).toBeUndefined();
  });

  it("fiyatsızDahil aralık YOKKEN de taşınır ama tek başına süzgeç sayılmaz", () => {
    const f = parseProductFilters({ fiyatsizDahil: "1" });
    expect(f.priceUnpriced).toBe(true);
    expect(activeFilterCount(f)).toBe(0);
  });
});
