/**
 * KESİNTİ ÖNBELLEĞE YAZILMAZ — yeniden deneme eklendikten sonra da (2026-10-08).
 * Yeniden deneme veri önbelleği geri çağrısının İÇİNDE çalışır: önbellek yalnız
 * SON sonucu görür. Vazgeçiş atılır (girdi oluşmaz / bayat girdi kalır),
 * toparlanan okuma tek kez yazılır. Sahte, Next `unstable_cache`in ilgili
 * dallarını taklit eder (bkz. `stale-regeneration.test.ts`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, { body: string; stale: boolean }>();
const writes: string[] = [];
const next = { isRevalidate: false };
vi.mock("next/cache", () => ({
  unstable_cache:
    (fn: () => Promise<unknown>, keyParts: string[]) =>
    async () => {
      const key = JSON.stringify(keyParts);
      const entry = store.get(key);
      const write = (result: unknown) => {
        writes.push(key);
        store.set(key, { body: JSON.stringify(result), stale: false });
      };
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
const response = (status: number, body: unknown = {}) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

beforeEach(() => {
  store.clear();
  writes.length = 0;
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

describe("önbellek yalnız son sonucu görür", () => {
  it("vazgeçiş önbelleğe girmez: API dönünce AYNI adres gerçek veriyi çeker", async () => {
    const { PublicApiUnavailableError, fetchListing } = await import("../marketplace-api");
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    await expect(fetchListing("rot-000001")).rejects.toBeInstanceOf(PublicApiUnavailableError);
    expect(writes).toEqual([]);
    expect(store.size).toBe(0);

    fetchMock.mockReset().mockResolvedValue(response(200, { number: "ROT-000001", title: "Vana" }));
    await expect(fetchListing("rot-000001")).resolves.toMatchObject({ title: "Vana" });
    expect(writes).toHaveLength(1);
  });

  it("yeniden denemeyle toparlanan okuma TEK kez ve gerçek veriyle yazılır", async () => {
    const { fetchListing } = await import("../marketplace-api");
    fetchMock.mockResolvedValueOnce(response(503)).mockResolvedValue(response(200, { number: "ROT-000002", title: "Boru" }));
    await expect(fetchListing("rot-000002")).resolves.toMatchObject({ title: "Boru" });
    expect(writes).toHaveLength(1);
    expect([...store.values()][0].body).toContain("Boru");
    // İkinci okuma önbellekten — API'ye gidilmez.
    fetchMock.mockClear();
    await fetchListing("rot-000002");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("bayat girdi + ISR yenilemesi + kesinti: son iyi kopya KALIR, üzerine yazılmaz", async () => {
    const { fetchListing } = await import("../marketplace-api");
    fetchMock.mockResolvedValue(response(200, { number: "ROT-000003", title: "Rulman" }));
    await fetchListing("rot-000003");
    store.forEach((e) => (e.stale = true));
    next.isRevalidate = true;
    writes.length = 0;
    fetchMock.mockReset().mockResolvedValue(response(503));
    await expect(fetchListing("rot-000003")).resolves.toMatchObject({ title: "Rulman" });
    expect(writes).toEqual([]);
  });
});

/**
 * İKİNCİL SAYIM (gözden geçirme C2-2): rozet ve boş dizin denetimi ana liste
 * çağrısını değil ikincil sayımı kullanır; adres + dil aynı olduğu için veri
 * önbelleği girdisi ana listeyle ORTAKTIR.
 */
describe("ikincil sayım ana listenin önbellek girdisini paylaşır", () => {
  const page = (total: number) => response(200, { items: [], total, page: 1, pageSize: 24 });

  it("ana liste yazdı → sayım API'ye gitmeden okur; sayım yazdı → ana liste API'ye gitmeden okur", async () => {
    const { fetchListingCount, fetchListings, fetchProductCount, fetchProducts } = await import("../marketplace-api");
    fetchMock.mockResolvedValue(page(7));
    await fetchProducts({ q: "vana" });
    fetchMock.mockClear();
    expect(await fetchProductCount({ q: "vana" })).toBe(7);
    expect(fetchMock).not.toHaveBeenCalled();

    fetchMock.mockResolvedValue(page(3));
    expect(await fetchListingCount({ q: "vana" })).toBe(3);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fetchMock.mockClear();
    expect((await fetchListings({ q: "vana" })).total).toBe(3);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(writes).toHaveLength(2);
  });

  it("sayımın kesintisi önbelleğe girmez: 'bilinmiyor' yazılmaz, sonraki ana okuma gerçek veriyi çeker", async () => {
    const { fetchProductCount, fetchProducts } = await import("../marketplace-api");
    fetchMock.mockResolvedValue(response(500));
    expect(await fetchProductCount({ q: "boru" })).toBeNull();
    expect(writes).toEqual([]);
    expect(store.size).toBe(0);
    fetchMock.mockReset().mockResolvedValue(page(4));
    expect((await fetchProducts({ q: "boru" })).total).toBe(4);
    expect(writes).toHaveLength(1);
  });
});
