import { SPECIAL_GEO_CITIES, foldSearchText } from "@rothern/shared";
import { geoIndex, setGeoIndex, type GeoCityRow } from "../../src/common/geo/geo-index";
import { GEO_FALLBACK_CACHE_CONTROL, GEO_RELOAD_RETRY_MS, GeoCityService } from "../../src/modules/geo/geo-city.service";
import { GeoController } from "../../src/modules/geo/geo.controller";

/**
 * ŞEHİR DİZİNİ SEED SONRASI KENDİLİĞİNDEN YÜKLENİR (derin denetim 2026-09-29
 * Y-21/X07). Migration konteyner açılışında koştuğu için `seed-geo-cities`
 * API AÇILDIKTAN SONRA koşulur; servis yalnız açılışta yüklediğinde canlı API
 * bir sonraki deploy'a dek TR yedeğinde kalıyordu (de-munich 404, yabancı
 * kayıtta cityId null).
 */
const munich: GeoCityRow = {
  id: 2867714, countryCode: "DE", name: "Munich", nameTr: "Münih", nameEn: "Munich", nameRu: "Мюнхен",
  slug: "de-munich", lat: 48.137, lng: 11.575, population: 1505005, searchText: foldSearchText("Munich Münih Мюнхен München"),
};
const tr: GeoCityRow[] = SPECIAL_GEO_CITIES.map((c) => ({ ...c, population: 0, searchText: foldSearchText([c.name, c.nameEn, c.nameRu].join(" ")) }));

function rig(batches: Array<GeoCityRow[] | Error>) {
  const findMany = jest.fn(async () => {
    const next = batches.length > 1 ? batches.shift()! : batches[0]!;
    if (next instanceof Error) throw next;
    return next;
  });
  const service = new GeoCityService({ geoCity: { findMany } } as never);
  return { service, findMany };
}

describe("GeoCityService — boş tabloda yeniden deneme", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    setGeoIndex(null);
  });
  afterEach(() => {
    jest.useRealTimers();
    setGeoIndex(null);
  });

  it("açılışta tablo boşsa yedekte kalır; seed sonrası sıradaki denemede dünya listesi yüklenir ve deneme durur", async () => {
    const { service, findMany } = rig([[], [...tr, munich]]);
    service.onModuleInit();
    await jest.advanceTimersByTimeAsync(0);
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(service.fullListLoaded).toBe(false);
    expect(geoIndex().resolveParam("de-munich")).toBeNull();

    await jest.advanceTimersByTimeAsync(GEO_RELOAD_RETRY_MS);
    expect(findMany).toHaveBeenCalledTimes(2);
    expect(service.fullListLoaded).toBe(true);
    expect(geoIndex().resolveParam("de-munich")?.id).toBe(2867714);
    expect(service.resolveCityId("DE", "München")).toBe(2867714);

    await jest.advanceTimersByTimeAsync(GEO_RELOAD_RETRY_MS * 3);
    expect(findMany).toHaveBeenCalledTimes(2); // dolu tabloda deneme yok
    service.onModuleDestroy();
  });

  it("okuma hatası da yeniden denenir", async () => {
    const { service, findMany } = rig([new Error("db down"), [...tr, munich]]);
    service.onModuleInit();
    await jest.advanceTimersByTimeAsync(0);
    expect(service.fullListLoaded).toBe(false);
    await jest.advanceTimersByTimeAsync(GEO_RELOAD_RETRY_MS);
    expect(findMany).toHaveBeenCalledTimes(2);
    expect(service.fullListLoaded).toBe(true);
    service.onModuleDestroy();
  });

  it("modül kapanınca bekleyen deneme iptal edilir", async () => {
    const { service, findMany } = rig([[]]);
    service.onModuleInit();
    await jest.advanceTimersByTimeAsync(0);
    service.onModuleDestroy();
    await jest.advanceTimersByTimeAsync(GEO_RELOAD_RETRY_MS * 2);
    expect(findMany).toHaveBeenCalledTimes(1);
  });

  it("açılışta dolu tabloda tek okuma, zamanlayıcı kurulmaz", async () => {
    const { service, findMany } = rig([[...tr, munich]]);
    service.onModuleInit();
    await jest.advanceTimersByTimeAsync(GEO_RELOAD_RETRY_MS * 2);
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(service.fullListLoaded).toBe(true);
  });
});

describe("GeoController — yedekteyken kısa önbellek", () => {
  afterEach(() => setGeoIndex(null));

  function res() {
    const headers: Record<string, string> = {};
    return {
      headers,
      vary: jest.fn(),
      setHeader: jest.fn((k: string, v: string) => {
        headers[k] = v;
      }),
    };
  }

  it("tam liste yüklenmemişken arama ve 404 kısa önbellekli (CDN'de 24 saat kalmaz)", () => {
    const controller = new GeoController({ fullListLoaded: false, toDto: jest.fn() } as never);
    const r1 = res();
    expect(controller.search(r1 as never, "Mun", "DE")).toEqual([]);
    expect(r1.headers["Cache-Control"]).toBe(GEO_FALLBACK_CACHE_CONTROL);
    const r2 = res();
    expect(() => controller.bySlug(r2 as never, "de-munich")).toThrow();
    expect(r2.headers["Cache-Control"]).toBe(GEO_FALLBACK_CACHE_CONTROL);
  });

  it("tam liste yüklüyken @Header'daki uzun önbellek ezilmez", () => {
    const controller = new GeoController({ fullListLoaded: true, toDto: jest.fn(() => ({})) } as never);
    const r = res();
    controller.search(r as never, "Ist", null as never);
    expect(r.setHeader).not.toHaveBeenCalled();
  });
});
