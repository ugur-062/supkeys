/**
 * Derin denetim LU-24: arama sekmesi sayaçları ikincildir — karşı yüzeyin ucu
 * kesintide (5xx/429/ağ) hata atsa da `crossCounts` reddedilmez; yalnız o
 * rozet düşer, arama sayfası hata sayfasına gitmez.
 *
 * Gözden geçirme C2-2: sayaç İKİNCİL OKUMAYLA çekilir. Ana liste çağrısıyla
 * çekilirken ana verinin yeniden deneme politikasını devralıyordu — arızalı uca
 * dört istek, ~4 sn bekleme ve süreç genelinde tek deneme kipi (sıradaki gerçek
 * ana okuma yeniden denemesiz kalıyordu).
 */
import { currencyForLocale } from "@rothern/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { crossCounts, crossListingParams, crossProductParams } from "../cross-counts";
import { parseListingFilters, toListingListParams } from "../listing-filter-params";
import { PAGE_LIMIT, parseProductFilters, toProductListParams } from "../product-filter-params";
import {
  PublicApiUnavailableError,
  fetchListing,
  fetchListingCount,
  fetchListings,
  fetchProductCount,
  fetchProducts,
  fetchPublicDirectory,
  fetchPublicDirectoryCount,
} from "../marketplace-api";
import { upstreamClock, upstreamInCooldown } from "../upstream-retry";

/**
 * Veri önbelleği girdisinin kimliği. Next `unstable_cache` anahtarı geri
 * çağrının KAYNAK METNİNDEN + anahtar parçalarından üretir; süre ve etiket
 * girdiyle birlikte yazılır. Önbelleksiz geçiş (kurulum dosyasındaki gibi),
 * yalnız kimlik kaydedilir.
 */
const cacheEntries = vi.hoisted(() => [] as { source: string; keyParts: string[]; opts: unknown }[]);
vi.mock("next/cache", async (orig) => ({
  ...(await orig<typeof import("next/cache")>()),
  unstable_cache:
    <A extends unknown[], R>(fn: (...args: A) => Promise<R>, keyParts: string[], opts: unknown) =>
    (...args: A) => {
      cacheEntries.push({ source: fn.toString(), keyParts, opts });
      return fn(...args);
    },
}));

const fetchMock = vi.fn();
const response = (status: number, body: unknown = {}) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const page = (total: number) => response(200, { items: [], total, page: 1, pageSize: 20 });
const callsTo = (part: string) => fetchMock.mock.calls.filter((c) => String(c[0]).includes(part)).length;

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.test/api");
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("crossCounts", () => {
  it("sorgu yoksa istek atmaz", async () => {
    expect(await crossCounts(undefined, "products")).toEqual({});
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("karşı yüzey 500 / 429 / ağ hatası → rozet yok, reddetmez", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    await expect(crossCounts("vana", "products")).resolves.toEqual({});
    fetchMock.mockResolvedValue({ ok: false, status: 429, json: async () => ({}) });
    await expect(crossCounts("vana", "listings")).resolves.toEqual({});
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    await expect(crossCounts("vana", "products")).resolves.toEqual({});
  });

  it("sağlıklı uç → toplam", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ items: [], total: 7, page: 1, pageSize: 20 }) });
    await expect(crossCounts("vana", "products")).resolves.toEqual({ listings: 7 });
  });

  it("sağlıklı uç, sonuç yok → gerçek sıfır rozeti (kesintinin 'bilinmiyor'undan ayrı)", async () => {
    fetchMock.mockResolvedValue(page(0));
    await expect(crossCounts("vana", "listings")).resolves.toEqual({ products: 0 });
  });
});

describe("crossCounts — ikincil okuma (gözden geçirme C2-2)", () => {
  /** `/public/products` arızalı (500), `/public/listings` sağlıklı. */
  const productsDown = () =>
    fetchMock.mockImplementation(async (url: string) => (String(url).includes("/public/products") ? response(500) : page(3)));

  it("arızalı karşı uca TEK istek gider; sayfa rozet için yeniden deneme takvimini beklemez", async () => {
    productsDown();
    const sleep = vi.mocked(upstreamClock.sleep);
    sleep.mockClear();
    // `/alim-talepleri?q=vana`: liste hazır, yalnız "Ürünler" rozeti soruluyor.
    await expect(crossCounts("vana", "listings")).resolves.toEqual({});
    expect(callsTo("/public/products")).toBe(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("rozetin vazgeçişi tek deneme kipini AÇMAZ: sıradaki ana okuma yeniden denemeyle toparlanır", async () => {
    productsDown();
    await crossCounts("vana", "listings");
    expect(upstreamInCooldown()).toBe(false);
    // Hemen ardından bir talep sayfası: API ilk denemede 503, ikincide 200.
    fetchMock.mockReset().mockResolvedValueOnce(response(503)).mockResolvedValue(response(200, { number: "ROT-000001", title: "Vana" }));
    await expect(fetchListing("rot-000001")).resolves.toMatchObject({ title: "Vana" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("asılı / çöken uçta da tek deneme (ağ hatası, zaman aşımı)", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    await expect(crossCounts("vana", "products")).resolves.toEqual({});
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(upstreamInCooldown()).toBe(false);
  });

  /**
   * Canlı doğrulama OUT-6: sayım `/public/listings?q=…` ve `/public/products?q=…`
   * soruyordu; karşı sekmenin SAYFASI ise ana listeye `type=ALIM` ve dilin para
   * birimini ekliyor → adresler ayrı, önbellek girdisi ortak DEĞİLDİ (eski test
   * iki tarafı da çıplak `{ q }` ile çağırdığı için bunu göremiyordu). Burada
   * ana liste, sayfaların (`ListingIndex` / `ProductIndex`) yaptığı gibi kurulur.
   */
  const listingPageParams = (q: string) => toListingListParams(parseListingFilters({ q }));
  const productPageParams = (q: string, locale = "tr") =>
    toProductListParams(parseProductFilters({ q }, undefined, { pageLimit: PAGE_LIMIT }), {
      defaultCurrency: currencyForLocale(locale),
    });

  it("adres karşı sekmenin SAYFASININ ana listesiyle AYNI (type=ALIM, dilin para birimi dahil)", async () => {
    fetchMock.mockResolvedValue(page(5));
    await fetchProducts(productPageParams("vana"));
    await fetchListings(listingPageParams("vana"));
    const mainUrls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(mainUrls).toEqual([
      "https://api.test/api/public/products?q=vana&currency=TRY",
      "https://api.test/api/public/listings?type=ALIM&q=vana",
    ]);
    fetchMock.mockClear();
    await crossCounts("vana", "listings"); // → ürün sayımı
    await crossCounts("vana", "products"); // → talep sayımı
    expect(fetchMock.mock.calls.map((c) => String(c[0]))).toEqual(mainUrls);
  });

  it("rozet sayımı karşı sekmenin ana listesinin önbellek GİRDİSİNİ yazar / okur (kesintide sekme önbellekten açılır)", async () => {
    fetchMock.mockResolvedValue(page(5));
    const entryOf = async (read: () => Promise<unknown>) => {
      cacheEntries.length = 0;
      await read();
      expect(cacheEntries).toHaveLength(1);
      return cacheEntries[0];
    };
    expect(await entryOf(() => crossCounts("vana", "products"))).toEqual(await entryOf(() => fetchListings(listingPageParams("vana"))));
    expect(await entryOf(() => crossCounts("vana", "listings"))).toEqual(await entryOf(() => fetchProducts(productPageParams("vana"))));
  });

  it.each(["tr", "en", "ru"])("sayım parametreleri sayfanın üreticisinden: %s dilinde de ana listeyle birebir", (locale) => {
    expect(crossProductParams("vana", locale)).toEqual(productPageParams("vana", locale));
    expect(crossProductParams("vana", locale).currency).toBe(currencyForLocale(locale));
    expect(crossListingParams("vana")).toEqual(listingPageParams("vana"));
    expect(crossListingParams("vana").type).toBe("ALIM");
  });

  it("ikincil sayım ana listenin önbellek GİRDİSİNİ kullanır: geri çağrı, anahtar, süre ve etiket aynı", async () => {
    fetchMock.mockResolvedValue(page(5));
    const entryOf = async (read: () => Promise<unknown>) => {
      cacheEntries.length = 0;
      await read();
      expect(cacheEntries).toHaveLength(1);
      return cacheEntries[0];
    };
    expect(await entryOf(() => fetchProductCount({ q: "vana" }))).toEqual(await entryOf(() => fetchProducts({ q: "vana" })));
    expect(await entryOf(() => fetchListingCount({ q: "vana" }))).toEqual(await entryOf(() => fetchListings({ q: "vana" })));
    expect(await entryOf(() => fetchPublicDirectoryCount({}))).toEqual(await entryOf(() => fetchPublicDirectory({})));
  });
});

describe("ikincil sayım — kesintide `null` (bilinmiyor), asla 0", () => {
  it("sağlıklı uç → toplam (0 dahil)", async () => {
    fetchMock.mockResolvedValue(page(12));
    expect(await fetchProductCount({ q: "vana" })).toBe(12);
    fetchMock.mockResolvedValue(page(0));
    expect(await fetchListingCount({})).toBe(0);
  });

  it.each([500, 503, 429, 400])("HTTP %i → null, tek deneme, hata atmaz", async (status) => {
    fetchMock.mockResolvedValue(response(status));
    expect(await fetchProductCount({})).toBeNull();
    expect(await fetchListingCount({})).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("ağ hatası → null, tek deneme", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    expect(await fetchProductCount({})).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("toplamı olmayan yanıt → null (uydurma 0 yok)", async () => {
    fetchMock.mockResolvedValue(response(200, { items: [] }));
    expect(await fetchProductCount({})).toBeNull();
  });

  /**
   * Kesinti OLMAYAN iki durum ana listenin BOŞ yedeğiyle aynı kalır (eskiden de
   * 0'dı): 404 gerçek "yok"tur — API'de pazar yeri anahtarı kapalıyken liste
   * uçları 404 döner, boş çizilen dizin `noindex` kalmalı.
   */
  it("404 ve tanımsız API adresi kesinti değildir → 0 (ana listenin boş yedeğiyle aynı)", async () => {
    fetchMock.mockResolvedValue(response(404));
    expect(await fetchProductCount({})).toBe(0);
    expect((await fetchProducts({})).total).toBe(0);
    await expect(crossCounts("vana", "listings")).resolves.toEqual({ products: 0 });
    vi.stubEnv("NEXT_PUBLIC_API_URL", "");
    vi.stubEnv("NODE_ENV", "production");
    fetchMock.mockClear();
    expect(await fetchListingCount({})).toBe(0);
    expect((await fetchListings({})).total).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("ana liste çağrısı kesintide hâlâ atar (sayım yardımcısı ana veriyi gevşetmez)", async () => {
    fetchMock.mockResolvedValue(response(500));
    await expect(fetchProducts({ q: "vana" })).rejects.toBeInstanceOf(PublicApiUnavailableError);
    await expect(fetchListings({ q: "vana" })).rejects.toBeInstanceOf(PublicApiUnavailableError);
  });
});
