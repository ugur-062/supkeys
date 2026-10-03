// @vitest-environment jsdom
/**
 * PANEL KATEGORİ SAYFASI — arayüz testi webA-12:
 *  · D-236 "Firmalar" sekmesi sayı rozeti taşır; sekme adresleri etkin
 *    süzgeçleri korur
 *  · D-237 var olmayan 8 haneli kod 404 (`notFound`), kalıcı iskelet değil
 */
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  search: "",
  slug: "39121000-elektrik-sistemleri",
  selectedCategory: null as { id: string; name: string; level: number } | null | undefined,
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(h.search),
  usePathname: () => `/company/satinalma/kategori/${h.slug}`,
  useParams: () => ({ slug: h.slug }),
  notFound: h.notFound,
}));
vi.mock("@/hooks/use-portal-discovery", () => ({
  useDiscoverSearch: () => ({ data: { items: [], total: 7, page: 1, pageSize: 24 }, isLoading: false }),
  useDiscoverProductFacets: () => ({
    data: {
      categories: [],
      selectedCategory: h.selectedCategory,
      subCategories: [],
      cities: [],
      activities: [],
      verified: 0,
      price: { has: 0, request: 0 },
      attributes: [],
    },
  }),
}));
vi.mock("@/hooks/use-company-auth", () => ({ useHasCompanyPermission: () => true }));
vi.mock("@/hooks/use-company-directory", () => ({
  useCompanySearch: () => ({ data: { items: [], total: 4, page: 1, pageSize: 20 } }),
}));

import PanelCategoryPage from "../page";

beforeEach(() => {
  h.search = "";
  h.slug = "39121000-elektrik-sistemleri";
  h.selectedCategory = { id: "39121000", name: "Elektrik Sistemleri", level: 3 };
  h.notFound.mockClear();
});

describe("panel kategori sayfası", () => {
  it("Firmalar sekmesi sayı rozeti taşır; iki sekmenin adresi etkin süzgeçleri korur (D-236)", () => {
    h.search = "q=pano&sehir=bursa";
    render(<PanelCategoryPage />);
    const tabs = screen.getByRole("navigation", { name: "Sonuç türü" });
    const links = Array.from(tabs.querySelectorAll("a"));
    const companies = links.find((a) => a.getAttribute("href")?.startsWith("/company/satinalma/firmalar"))!;
    const products = links.find((a) => a.getAttribute("href")?.startsWith("/company/satinalma/kategori/"))!;
    expect(companies.textContent).toContain("4");
    const ch = new URL(companies.getAttribute("href")!, "http://x");
    expect(ch.searchParams.get("q")).toBe("pano");
    expect(ch.searchParams.get("kategori")).toBe("39121000");
    const ph = new URL(products.getAttribute("href")!, "http://x");
    expect(ph.searchParams.get("q")).toBe("pano");
    expect(ph.searchParams.get("sehir")).toBe("bursa");
    // Kategori yolda — sorguya ikinci kez yazılmaz.
    expect(ph.searchParams.get("kategori")).toBeNull();
    expect(h.notFound).not.toHaveBeenCalled();
  });

  it("sunucu kategoriyi çözemezse (selectedCategory null) 404 verir (D-237)", () => {
    h.slug = "99999999-yok";
    h.selectedCategory = null;
    expect(() => render(<PanelCategoryPage />)).toThrow("NEXT_NOT_FOUND");
    expect(h.notFound).toHaveBeenCalled();
  });

  it("alanı taşımayan eski yanıtta (undefined) 404 verilmez", () => {
    h.selectedCategory = undefined;
    render(<PanelCategoryPage />);
    expect(h.notFound).not.toHaveBeenCalled();
  });
});
