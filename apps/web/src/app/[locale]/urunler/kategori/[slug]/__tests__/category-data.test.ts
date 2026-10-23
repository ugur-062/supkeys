import { beforeEach, describe, expect, it, vi } from "vitest";

/* Kategori açılış sayfası çözümü (2026-09-27 SEO denetimi): facet taramasına
   (5.000 kayıt tavanı) değil segment listesine + liste ucunun `total`ına bağlı. */
const api = vi.hoisted(() => ({
  fetchSegments: vi.fn(),
  fetchProducts: vi.fn(),
  fetchProductFacets: vi.fn(),
}));
vi.mock("@/lib/public/marketplace-api", () => api);

import { resolveSegmentLanding } from "../category-data";

beforeEach(() => {
  api.fetchSegments.mockResolvedValue([
    { id: "31000000", nameTr: "Manufacturing components", slug: "uretim-bilesenleri" },
    { id: "40000000", nameTr: "Distribution systems", slug: "dagitim-sistemleri" },
  ]);
  api.fetchProducts.mockImplementation(async (p: { category?: string }) => ({
    items: [],
    total: p.category === "31000000" ? 12_345 : 0,
    page: 1,
    pageSize: 24,
  }));
});

describe("resolveSegmentLanding", () => {
  it("ad segment listesinden (okuyucunun dili), slug Türkçe, sayı liste ucunun total'ı — facet çağrılmaz", async () => {
    await expect(resolveSegmentLanding("31000000")).resolves.toEqual({
      id: "31000000",
      name: "Manufacturing components",
      slug: "uretim-bilesenleri",
      count: 12_345,
      // Liste ucunun sayfa boyu aynı yanıttan: meta son sayfayı bununla hesaplar.
      pageSize: 24,
    });
    expect(api.fetchProducts).toHaveBeenCalledWith({ category: "31000000" });
    expect(api.fetchProductFacets).not.toHaveBeenCalled();
  });

  it("ürünü olmayan segment, segment olmayan kod ve gizli segment → null (sayfa 404)", async () => {
    await expect(resolveSegmentLanding("40000000")).resolves.toBeNull();
    await expect(resolveSegmentLanding("31161500")).resolves.toBeNull();
    await expect(resolveSegmentLanding("10000000")).resolves.toBeNull();
    await expect(resolveSegmentLanding("77000000")).resolves.toBeNull();
  });

  // 2026-10-10 (sahip kararı): 46 "İş Güvenliği ve Yangın Ekipmanları" adıyla
  // geri açıldı — açılış sayfası vardır. Silah / kolluk dalları gizli kalır:
  // sayı liste ucunun `total`ıdır (API gizli dallardaki ürünü saymaz), yani
  // yalnız gizli dalda ürünü olan sektör `total: 0` ile yine 404'tür. Gizli
  // ailenin / sınıfın kodu segment kodu olmadığından hiçbir zaman sayfa değildir.
  it("46 çözülür (ad, slug, sayı); ürünü görünür dalda yoksa ve gizli dalın kodunda 404", async () => {
    api.fetchSegments.mockResolvedValue([
      { id: "46000000", nameTr: "İş Güvenliği ve Yangın Ekipmanları", slug: "is-guvenligi-ve-yangin-ekipmanlari" },
    ]);
    api.fetchProducts.mockResolvedValueOnce({ items: [], total: 7, page: 1, pageSize: 24 });
    await expect(resolveSegmentLanding("46000000")).resolves.toEqual({
      id: "46000000",
      name: "İş Güvenliği ve Yangın Ekipmanları",
      slug: "is-guvenligi-ve-yangin-ekipmanlari",
      count: 7,
      pageSize: 24,
    });
    expect(api.fetchProducts).toHaveBeenLastCalledWith({ category: "46000000" });
    api.fetchProducts.mockResolvedValueOnce({ items: [], total: 0, page: 1, pageSize: 24 });
    await expect(resolveSegmentLanding("46000000")).resolves.toBeNull();
    api.fetchProducts.mockClear();
    for (const hidden of ["46100000", "46101500", "46182500"]) await expect(resolveSegmentLanding(hidden)).resolves.toBeNull();
    expect(api.fetchProducts).not.toHaveBeenCalled();
  });
});
