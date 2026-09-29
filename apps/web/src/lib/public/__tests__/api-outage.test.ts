/**
 * API KESİNTİSİ "BOŞ VERİ" DEĞİLDİR (yayın denetimi 2026-09-28 B1-1): ana veri
 * çağrıları ağ hatası/5xx/429'da çalışma anında HATA atar — ISR son iyi sürümü
 * korur, detay sayfası 404'e dönmez. 404 gerçek "yok"tur. `next build`
 * sırasında atılmaz (Render askısında derleme kırılmasın). İkincil bloklar
 * (facet vb.) yedekle kalır.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PublicApiUnavailableError,
  fetchFacets,
  fetchListing,
  fetchListings,
  fetchProduct,
  fetchProductSitemap,
  fetchSimilarListings,
} from "../marketplace-api";

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

