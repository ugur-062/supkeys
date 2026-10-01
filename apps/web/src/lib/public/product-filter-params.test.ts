import { describe, expect, it } from "vitest";
import { activeFilterCount, buildProductFilterQuery, clearProductFilters, parseProductFilters, productSearchCarry, toProductFacetParams, toProductListParams } from "./product-filter-params";

describe("ürün süzgeç URL şeması", () => {
  it("Türkçe sorguyu ayrıştırır: çoklu şehir/faaliyet, aralık, sıralama", () => {
    const f = parseProductFilters({ q: " pano ", kategori: "39000000", sehir: "İstanbul,İzmir", faaliyet: "MANUFACTURER,hacker", dogrulanmis: "1", fiyat: "var", fiyatMin: "100", fiyatMax: "abc", moqMax: "50", sirala: "fiyat-azalan", nitelik: ["malzeme:Çelik", "bozuk"], sayfa: "3" });
    expect(f).toMatchObject({ q: "pano", category: "39000000", cities: ["istanbul", "izmir"], activities: ["MANUFACTURER"], verified: true, price: "var", priceMin: 100, priceMax: undefined, moqMax: 50, sort: "fiyat-azalan", attrs: ["malzeme:Çelik"], page: 3 });
    expect(toProductListParams(f)).toMatchObject({ city: "istanbul,izmir", activity: "MANUFACTURER", verified: true, price: "has", sort: "price_desc", page: 3 });
  });
  it("yoldan gelen kategori sorgudakini ezer; eski `il` parametresi okunur", () => {
    expect(parseProductFilters({ kategori: "11000000", il: "Bursa" }, "39000000")).toMatchObject({ category: "39000000", cities: ["bursa"] });
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

  it("arayüz testi D-232: aralık yokken 'fiyatsızlar dahil' URL'e yazılmaz", () => {
    const f = parseProductFilters({ fiyatMin: "10", fiyatMax: "50", fiyatsizDahil: "1" });
    expect(buildProductFilterQuery(f)).toContain("fiyatsizDahil=1");
    expect(buildProductFilterQuery({ ...f, priceMin: undefined, priceMax: undefined })).toBe("");
  });

  it("arayüz testi D-074: ters fiyat aralığı yer değiştirir", () => {
    expect(parseProductFilters({ fiyatMin: "5000", fiyatMax: "100" })).toMatchObject({ priceMin: 100, priceMax: 5000 });
  });

  it("arayüz testi D-056: değerler API doğrulama sınırlarına kırpılır (400 → sessiz boş liste olmasın)", () => {
    const f = parseProductFilters(
      {
        q: "a".repeat(130),
        sayfa: "201",
        fiyatMax: "99999999999",
        moqMax: "0",
        yakin: "x".repeat(60),
        nitelik: ["Malzeme:Celik", `a:${"b".repeat(70)}`, "malzeme:Çelik"],
      },
      undefined,
      { pageLimit: 200 },
    );
    expect(f.q).toHaveLength(120);
    expect(f.page).toBe(200);
    expect(f.priceMax).toBe(1_000_000_000);
    expect(f.moqMax).toBeUndefined();
    expect(f.near).toHaveLength(40);
    expect(f.attrs).toEqual(["malzeme:Çelik"]);
  });

  it("gözden geçirme D-056: sayfa tavanı yalnız isteyen yüzeyde (panel ucu sınırsız)", () => {
    expect(parseProductFilters({ sayfa: "201" }).page).toBe(201);
    expect(parseProductFilters({ sayfa: "201" }, undefined, { pageLimit: 200 }).page).toBe(200);
  });

  it("gözden geçirme O-016: fiyat sınırı 0 = sınır yok — fiyatMin=0 ne okunur ne yazılır", () => {
    expect(parseProductFilters({ fiyatMin: "0", fiyatMax: "40" })).toMatchObject({ priceMin: undefined, priceMax: 40 });
    expect(parseProductFilters({ fiyatMin: "5", fiyatMax: "0" })).toMatchObject({ priceMin: 5, priceMax: undefined });
    const q = buildProductFilterQuery({ ...parseProductFilters({}), priceMin: 0, priceMax: 40, priceUnpriced: true });
    expect(q).not.toContain("fiyatMin");
    expect(q).toContain("fiyatMax=40");
    expect(buildProductFilterQuery({ ...parseProductFilters({}), priceMin: 0, priceUnpriced: true })).toBe("");
  });

  it("arayüz testi O-080: sayaç parametreleri listeyle aynı süzgeçleri taşır (tek yardımcı)", () => {
    const f = parseProductFilters({ sertifika: "ISO 9001", calisan: "10", hizli: "1", yakin: "izmir", mesafe: "50", ulke: "DE,IT", fiyatMin: "10", moqMax: "100" });
    const facet = toProductFacetParams(toProductListParams(f));
    expect(facet).toMatchObject({ cert: "ISO 9001", employees: "10", fastReply: true, near: "izmir", radius: 50, country: "DE,IT" });
    // Aralık ve MOQ bilerek facet'e gitmez (kenar önbelleği anahtarı).
    expect(facet).not.toHaveProperty("priceMin");
    expect(facet).not.toHaveProperty("moqMax");
  });
});
