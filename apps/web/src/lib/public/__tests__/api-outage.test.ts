/**
 * API KESİNTİSİ "BOŞ VERİ" DEĞİLDİR (yayın denetimi 2026-09-28 B1-1): ana veri
 * çağrıları ağ hatası/5xx/429'da (liste çağrıları 404 dışındaki 4xx'te de) çalışma anında HATA atar — ISR son iyi sürümü
 * korur, detay sayfası 404'e dönmez. 404 gerçek "yok"tur. `next build`
 * sırasında atılmaz (Render askısında derleme kırılmasın). İkincil bloklar
 * (facet vb.) yedekle kalır.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PublicApiUnavailableError,
  fetchCompanyProducts,
  fetchFacets,
  fetchListing,
  fetchListings,
  fetchProduct,
  fetchProductSitemap,
  fetchProducts,
  fetchPublicDirectory,
  fetchSimilarListings,
} from "../marketplace-api";
import { parseListingFilters, toListingListParams } from "../listing-filter-params";
import { parseProductFilters, toProductListParams } from "../product-filter-params";

const fetchMock = vi.fn();
const respond = (status: number, body: unknown = {}) =>
  fetchMock.mockResolvedValue({ ok: status >= 200 && status < 300, status, json: async () => body });

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

describe("detay çağrısı — 404 ≠ kesinti", () => {
  it("404 → null (sayfa notFound)", async () => {
    respond(404);
    expect(await fetchProduct("firma", "urun")).toBeNull();
    expect(await fetchListing("rot-000001")).toBeNull();
  });
  it("503 / 429 / ağ hatası → hata atar (404 önbelleğe girmez)", async () => {
    respond(503);
    await expect(fetchProduct("firma", "urun")).rejects.toBeInstanceOf(PublicApiUnavailableError);
    respond(429);
    await expect(fetchListing("rot-000001")).rejects.toBeInstanceOf(PublicApiUnavailableError);
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    await expect(fetchProduct("firma", "urun")).rejects.toBeInstanceOf(PublicApiUnavailableError);
  });
  it("derleme sırasında kesinti hata atmaz (null) — Render askısında derleme kırılmaz", async () => {
    vi.stubEnv("NEXT_PHASE", "phase-production-build");
    respond(503);
    expect(await fetchProduct("firma", "urun")).toBeNull();
  });
});

describe("liste ve sitemap — ana veri", () => {
  it("5xx / ağ hatası → hata atar; 404 → boş yedek", async () => {
    respond(500);
    await expect(fetchListings({})).rejects.toBeInstanceOf(PublicApiUnavailableError);
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    await expect(fetchProductSitemap(0)).rejects.toBeInstanceOf(PublicApiUnavailableError);
    respond(404);
    expect((await fetchListings({})).items).toEqual([]);
  });
  it("ikincil blok (facet) kesintide yedekle kalır — sayfayı düşürmez", async () => {
    respond(500);
    const facets = await fetchFacets({});
    expect(facets.categories).toEqual([]);
  });
  it("ikincil blok (benzer talepler) 503/429/ağ hatasında boş kalır — talep sayfası düşmez", async () => {
    respond(503);
    expect((await fetchSimilarListings({ type: "ALIM", category: "43000000" })).items).toEqual([]);
    respond(429);
    expect((await fetchSimilarListings({ type: "ALIM" })).items).toEqual([]);
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    expect((await fetchSimilarListings({ type: "ALIM" })).items).toEqual([]);
  });
});

/**
 * DAĞITIM PENCERESİ (canlı öncesi, staging): yeni web eski API'ye yeni sorgu
 * parametresi yollayınca API `forbidNonWhitelisted` ile 400 döner. Ana liste
 * bunu BOŞ yedekle çizip ISR'a yazıyordu; artık 404 dışındaki 4xx de kesinti.
 */
describe("ana liste — 404 dışındaki 4xx kesintidir", () => {
  it.each([400, 403, 409, 422])("HTTP %i → çalışma anında hata atar", async (status) => {
    respond(status);
    await expect(fetchListings({})).rejects.toBeInstanceOf(PublicApiUnavailableError);
    await expect(fetchProducts({ q: "vana" })).rejects.toBeInstanceOf(PublicApiUnavailableError);
    await expect(fetchPublicDirectory({})).rejects.toBeInstanceOf(PublicApiUnavailableError);
    await expect(fetchCompanyProducts("firma")).rejects.toBeInstanceOf(PublicApiUnavailableError);
    await expect(fetchProductSitemap(0)).rejects.toBeInstanceOf(PublicApiUnavailableError);
  });
  it("derleme sırasında 400 hata atmaz — boş yedekle çıkar (API'siz derleme kırılmaz)", async () => {
    vi.stubEnv("NEXT_PHASE", "phase-production-build");
    respond(400);
    expect((await fetchListings({})).items).toEqual([]);
    expect(await fetchProductSitemap(0)).toEqual([]);
  });
  it("404 yine gerçek 'yok': boş yedek, hata yok", async () => {
    respond(404);
    expect((await fetchProducts({})).items).toEqual([]);
    expect((await fetchCompanyProducts("firma")).items).toEqual([]);
  });
  it("ikincil bloklar 400'de de yedekle kalır (facet, benzer talepler)", async () => {
    respond(400);
    expect((await fetchFacets({})).categories).toEqual([]);
    expect((await fetchSimilarListings({ type: "ALIM" })).items).toEqual([]);
  });
  it("tekil kayıt 400 → null (yolu kullanıcı yazar; 404 anlamı korunur)", async () => {
    respond(400);
    expect(await fetchListing("rot-000001")).toBeNull();
    expect(await fetchProduct("firma", "urun")).toBeNull();
  });
  it("firma ürünleri: elle yazılmış sayfa/arama API sınırlarına kırpılır (400'e düşmez)", async () => {
    respond(200, { items: [], total: 0, page: 200, pageSize: 24 });
    await fetchCompanyProducts("firma", { q: `  ${"a".repeat(130)}  `, page: 500.5, categoryId: "abc" });
    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.searchParams.get("page")).toBe("200");
    expect(url.searchParams.get("q")).toBe("a".repeat(120));
    expect(url.searchParams.has("categoryId")).toBe(false);
  });
  it("süzgeç URL'i API tavanını aşsa da ana liste 400'e düşmez (ayrıştırıcı keser)", async () => {
    respond(200, { items: [], total: 0, page: 1, pageSize: 24 });
    const huge = Array.from({ length: 10 }, (_, i) => `${String(i)}${"x".repeat(60)}`).join(",");
    await fetchProducts(toProductListParams(parseProductFilters({ sehir: huge, sertifika: huge })));
    await fetchListings(toListingListParams(parseListingFilters({ sehir: huge, aliciUlke: huge })));
    const [productUrl, listingUrl] = fetchMock.mock.calls.map((c) => new URL(c[0] as string));
    // API `PublicProductQueryDto` / `PublicListQueryDto`: city, cert ≤ 400.
    expect(productUrl.searchParams.get("city")!.length).toBeLessThanOrEqual(400);
    expect(productUrl.searchParams.get("cert")!.length).toBeLessThanOrEqual(400);
    // Talep dizini: alıcı şehri süzgeci yok (2026-10-04); bozuk alıcı ülkesi düşer.
    expect(listingUrl.searchParams.has("city")).toBe(false);
    expect(listingUrl.searchParams.has("buyerCountry")).toBe(false);
  });
});

describe("web sunucusu → API hız sınırı muafiyeti başlığı", () => {
  it("sır tanımlıysa x-rothern-ssr gönderilir, değilse gönderilmez", async () => {
    respond(200, { items: [], total: 0, page: 1, pageSize: 24 });
    await fetchListings({});
    expect((fetchMock.mock.calls[0][1] as { headers: Record<string, string> }).headers["x-rothern-ssr"]).toBeUndefined();
    vi.stubEnv("SEO_REVALIDATE_SECRET", "k".repeat(32));
    await fetchListings({});
    expect((fetchMock.mock.calls[1][1] as { headers: Record<string, string> }).headers["x-rothern-ssr"]).toBe("k".repeat(32));
  });
});

