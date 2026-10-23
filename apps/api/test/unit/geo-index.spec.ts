import { SPECIAL_GEO_CITIES, foldSearchText } from "@rothern/shared";
import { GeoIndex, geoIndex, resolveCityId, setGeoIndex, storedCityName, type GeoCityRow } from "../../src/common/geo/geo-index";
import { cityIdsOf, nearCityIds } from "../../src/common/company/product-index";

/**
 * DÜNYA ŞEHİR DİZİNİ sözleşmesi (2026-09-27, kullanıcı: "şehir sayfaları
 * türkiye özel olamaz"). Gerçek liste GeoNames'ten ~34 bin satır; burada
 * Türkiye illeri + birkaç yabancı şehirle kurulur.
 */
const foreign: GeoCityRow[] = [
  { id: 2867714, countryCode: "DE", name: "Munich", nameTr: "Münih", nameEn: "Munich", nameRu: "Мюнхен", slug: "de-munich", lat: 48.137, lng: 11.575, population: 1505005, searchText: foldSearchText("Munich Münih Мюнхен München") },
  { id: 2867993, countryCode: "DE", name: "Augsburg", nameTr: "Augsburg", nameEn: "Augsburg", nameRu: "Аугсбург", slug: "de-augsburg", lat: 48.371, lng: 10.898, population: 259196, searchText: foldSearchText("Augsburg Аугсбург") },
  { id: 2643743, countryCode: "GB", name: "London", nameTr: "Londra", nameEn: "London", nameRu: "Лондон", slug: "gb-london", lat: 51.508, lng: -0.125, population: 8961989, searchText: foldSearchText("London Londra Лондон") },
];
const tr: GeoCityRow[] = SPECIAL_GEO_CITIES.map((c) => ({ ...c, population: 0, searchText: foldSearchText([c.name, c.nameEn, c.nameRu].join(" ")) }));

beforeAll(() => setGeoIndex(new GeoIndex([...tr, ...foreign])));
afterAll(() => setGeoIndex(null));

describe("dünya şehir dizini", () => {
  it("kalıcı adres, eski ham il adı ve yabancı şehrin herhangi bir dildeki adı çözülür", () => {
    const idx = geoIndex();
    expect(idx.resolveParam("de-munich")?.id).toBe(2867714);
    expect(idx.resolveParam("İstanbul")?.slug).toBe("istanbul"); // eski ?sehir=İstanbul bağlantıları
    expect(idx.resolveParam("istanbul")?.id).toBe(-1034);
    expect(idx.resolveParam("Munich")?.slug).toBe("de-munich");
    expect(idx.resolveParam("Münih")?.slug).toBe("de-munich");
    // Yerel yazım ("München") ülke İÇİ eşlemede (yazma yolu) çözülür; ülkesiz
    // genel çözüm yalnız resmî adlara bakar (her istekte 34 bin satır taranmasın).
    expect(idx.resolveText("DE", "München")).toBe(2867714);
    expect(idx.resolveParam("yok-böyle")).toBeNull();
  });

  it("yazma yolu: ülke içinde eşler; başka ülkenin id'si kabul edilmez", () => {
    expect(resolveCityId("DE", "München")).toBe(2867714);
    expect(resolveCityId("DE", "Munich", 2867714)).toBe(2867714);
    expect(resolveCityId("GB", "x", 2867714)).toBeNull(); // id DE'ye ait
    expect(resolveCityId("TR", "Bursa")).toBe(-1016);
    expect(resolveCityId("DE", "Hamburg")).toBeNull(); // listede yok → metin kalır
  });

  it("saklanan şehir adı tek biçim: seçici hangi dilde verse de yabancıda İngilizce, Türkiye'de Türkçe", () => {
    expect(storedCityName(resolveCityId("DE", "Мюнхен", 2867714), "Мюнхен")).toBe("Munich");
    expect(storedCityName(resolveCityId("TR", "istanbul"), "istanbul")).toBe("İstanbul");
    expect(storedCityName(resolveCityId("DE", "Hamburg"), " Hamburg ")).toBe("Hamburg");
  });

  it("'Yakınımda' dünya geneli: Münih 100 km → Augsburg dahil, Londra değil; yabancı posta kodu Türk ili sanılmaz", () => {
    const ids = nearCityIds({ near: "de-munich", radius: 100 });
    expect(ids).toEqual(expect.arrayContaining([2867714, 2867993]));
    expect(ids).not.toContain(2643743);
    // Türk posta kodu hâlâ il merkezi (eski davranış)
    expect(nearCityIds({ near: "34000", radius: 25 })).toContain(-1034);
    expect(nearCityIds({ near: "yok", radius: 25 })).toEqual([]);
  });

  it("süzgeç değerleri id'ye döner (çoklu, karışık ülke)", () => {
    expect(cityIdsOf("istanbul,de-munich")).toEqual([-1034, 2867714]);
  });

  it("arama önerisi: ülke içinde ve dil bağımsız", () => {
    const idx = geoIndex();
    expect(idx.search("munc").map((r) => r.slug)).toContain("de-munich");
    expect(idx.search("лонд").map((r) => r.slug)).toEqual(["gb-london"]);
    expect(idx.search("aug", { country: "GB" })).toEqual([]);
    expect(idx.label(idx.bySlug("de-munich")!, "tr")).toBe("Münih");
    expect(idx.label(idx.bySlug("de-munich")!, "ru")).toBe("Мюнхен");
  });
});
