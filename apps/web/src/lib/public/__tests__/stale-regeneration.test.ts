/**
 * ISR YENİLEMESİNDE 404 GERÇEKTEN "YOK" OLUR (derin denetim RM-12 gözden
 * geçirme). Next 15 `unstable_cache`: girdi bayat + `workStore.isRevalidate`
 * iken geri çağrıyı bekler, geri çağrı ATARSA hatayı yutup BAYAT gövdeyi döner.
 * 404 atılsaydı gizlenen/silinen ilan ya da ürün, SEO etiket kancası
 * kaçtığında her yenilemede eski veriyle çizilirdi. 404 bu yüzden önbelleğe
 * yazılan bir DEĞERDİR; 5xx/429/ağ hatası atılır → son iyi kopya kalır (B1-1).
 * Ana LİSTE çağrılarında 404 dışındaki 4xx de kesintidir (dağıtım penceresi,
 * canlı öncesi): önbelleğe yazılmaz, son iyi kopya kalır, girdi yoksa atılır.
 * Sahte, Next'in bu dalını birebir taklit eder (JSON gövde, hata → bayat).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, { body: string; stale: boolean }>();
const next = { isRevalidate: false };
vi.mock("next/cache", () => ({
  unstable_cache:
    (fn: () => Promise<unknown>, keyParts: string[]) =>
    async () => {
      const key = JSON.stringify(keyParts);
      const entry = store.get(key);
      const write = (result: unknown) => store.set(key, { body: JSON.stringify(result), stale: false });
      if (entry) {
        const cached = JSON.parse(entry.body) as unknown;
        if (entry.stale && next.isRevalidate) {
          return fn().then(
            (result) => (write(result), result),
            () => cached,
          );
        }
        return cached;
      }
      const result = await fn();
      write(result);
      return result;
    },
}));

const fetchMock = vi.fn();
const respond = (status: number, body: unknown = {}) =>
  fetchMock.mockResolvedValue({ ok: status >= 200 && status < 300, status, json: async () => body });
const markAllStale = () => store.forEach((e) => (e.stale = true));

beforeEach(() => {
  store.clear();
  next.isRevalidate = false;
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

describe("bayat girdi + ISR yenilemesi", () => {
  it("ilan gizlendi (API 404) → yenileme null döner, eski ilan çizilmez", async () => {
    const { fetchListing } = await import("../marketplace-api");
    respond(200, { id: "l1", title: "Eski ilan" });
    expect(await fetchListing("rot-000001")).toMatchObject({ title: "Eski ilan" });
    markAllStale();
    next.isRevalidate = true;
    respond(404);
    expect(await fetchListing("rot-000001")).toBeNull();
    // Sonraki (taze) okuma da "yok"u önbellekten verir, API'ye gitmez.
    next.isRevalidate = false;
    fetchMock.mockClear();
    expect(await fetchListing("rot-000001")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("ürün kaldırıldı (API 404) → yenileme null döner", async () => {
    const { fetchProduct } = await import("../marketplace-api");
    respond(200, { id: "p1", name: "Eski ürün" });
    expect(await fetchProduct("firma", "urun")).toMatchObject({ name: "Eski ürün" });
    markAllStale();
    next.isRevalidate = true;
    respond(404);
    expect(await fetchProduct("firma", "urun")).toBeNull();
  });

  it("liste ucu 404 → yedek (eski liste değil)", async () => {
    const { fetchCompanyProducts } = await import("../marketplace-api");
    respond(200, { items: [{ id: "p1" }], total: 1, page: 1, pageSize: 24 });
    expect((await fetchCompanyProducts("firma")).total).toBe(1);
    markAllStale();
    next.isRevalidate = true;
    respond(404);
    expect((await fetchCompanyProducts("firma")).total).toBe(0);
  });

  it("kesinti (503 / 429 / ağ hatası) → son iyi kopya kalır (B1-1)", async () => {
    const { fetchListing } = await import("../marketplace-api");
    respond(200, { id: "l1", title: "Son iyi" });
    await fetchListing("rot-000001");
    next.isRevalidate = true;
    for (const fail of [() => respond(503), () => respond(429), () => fetchMock.mockRejectedValue(new TypeError("fetch failed"))]) {
      markAllStale();
      fail();
      expect(await fetchListing("rot-000001")).toMatchObject({ title: "Son iyi" });
    }
  });

  it("liste ucu kesintisi (503 / 400 / 409 / 422) → son iyi liste kalır, boş yedek çizilmez", async () => {
    // Dağıtım penceresi (canlı öncesi): yeni web eski API'ye yeni parametre
    // yollar, `forbidNonWhitelisted` 400 döner. 400 önbelleğe yazılmaz.
    const { fetchListings } = await import("../marketplace-api");
    respond(200, { items: [{ id: "l1" }], total: 1, page: 1, pageSize: 24 });
    expect((await fetchListings({})).total).toBe(1);
    next.isRevalidate = true;
    for (const status of [503, 400, 409, 422]) {
      markAllStale();
      respond(status);
      expect((await fetchListings({})).total).toBe(1);
    }
  });

  it("liste ucu ilk okumada (girdi yok) 400 → hata atar: boş liste sayfası ISR'a yazılmaz", async () => {
    const { fetchListings, fetchProducts, PublicApiUnavailableError } = await import("../marketplace-api");
    respond(400);
    await expect(fetchListings({ sort: "closing" })).rejects.toBeInstanceOf(PublicApiUnavailableError);
    await expect(fetchProducts({ q: "vana" })).rejects.toBeInstanceOf(PublicApiUnavailableError);
    expect(store.size).toBe(0);
    // API güncellenince aynı anahtar normal doldurulur.
    respond(200, { items: [{ id: "l1" }], total: 1, page: 1, pageSize: 24 });
    expect((await fetchListings({ sort: "closing" })).total).toBe(1);
  });

  it("derlemede liste ucu 400 → boş yedek (API'siz derleme kırılmaz), önbelleğe yazılmaz", async () => {
    vi.stubEnv("NEXT_PHASE", "phase-production-build");
    const { fetchListings } = await import("../marketplace-api");
    respond(400);
    expect((await fetchListings({})).total).toBe(0);
    expect(store.size).toBe(0);
  });

  it("ilk okuma (girdi yok) 404 → null; önizleme (fresh) de null", async () => {
    const { fetchListing, fetchCompanyProfile } = await import("../marketplace-api");
    respond(404);
    expect(await fetchListing("yok")).toBeNull();
    expect(await fetchCompanyProfile("yok", { fresh: true })).toBeNull();
  });
});

/**
 * ŞEHİR 404'Ü ÖNBELLEĞE YAZILMAZ (derin denetim RM-12 son gözden geçirme).
 * API şehir dizini yedek moddayken (tablo okunamadı / seed penceresi) yabancı
 * şehre 5 dk'lık 404 döner. Etiketsiz 24 saatlik girdiye yazılsaydı API
 * düzeldikten sonra da şehir sayfası bir gün 404 kalırdı.
 */
describe("şehir sayfası — geçici 404 negatif önbelleğe girmez", () => {
  it("yedek moddaki 404 yazılmaz: API düzelince hemen gerçek şehir döner", async () => {
    const { fetchGeoCity } = await import("../marketplace-api");
    respond(404);
    expect(await fetchGeoCity("de-munich")).toBeNull();
    expect(store.size).toBe(0);
    respond(200, { slug: "de-munich", name: "Munich", country: "DE" });
    expect(await fetchGeoCity("de-munich")).toMatchObject({ slug: "de-munich" });
  });

  it("bayat geçerli şehir + yedek moddaki 404 → bayat girdi korunur (404 ile ezilmez)", async () => {
    const { fetchGeoCity } = await import("../marketplace-api");
    respond(200, { slug: "de-munich", name: "Munich", country: "DE" });
    expect(await fetchGeoCity("de-munich")).toMatchObject({ name: "Munich" });
    markAllStale();
    next.isRevalidate = true;
    respond(404);
    expect(await fetchGeoCity("de-munich")).toMatchObject({ name: "Munich" });
    next.isRevalidate = false;
    fetchMock.mockClear();
    expect(await fetchGeoCity("de-munich")).toMatchObject({ name: "Munich" });
  });
});
