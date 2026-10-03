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
    });
    expect(api.fetchProducts).toHaveBeenCalledWith({ category: "31000000" });
    expect(api.fetchProductFacets).not.toHaveBeenCalled();
  });

  it("ürünü olmayan segment, segment olmayan kod ve gizli segment → null (sayfa 404)", async () => {
    await expect(resolveSegmentLanding("40000000")).resolves.toBeNull();
    await expect(resolveSegmentLanding("31161500")).resolves.toBeNull();
    await expect(resolveSegmentLanding("10000000")).resolves.toBeNull();
  });
});
