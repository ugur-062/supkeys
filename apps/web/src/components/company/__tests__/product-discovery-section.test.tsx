// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  search: "",
  replace: vi.fn(),
  result: { data: undefined as unknown, isLoading: false },
  lastParams: undefined as unknown,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: h.replace }),
  useSearchParams: () => new URLSearchParams(h.search),
  usePathname: () => "/company/satinalma",
}));
vi.mock("@/hooks/use-portal-discovery", () => ({
  useDiscoverSearch: (params: unknown) => {
    h.lastParams = params;
    return h.result;
  },
  useDiscoverProductFacets: () => ({
    data: {
      categories: [{ id: "39000000", name: "Elektrik", count: 2 }],
      cities: [{ city: "Bursa", count: 2 }],
      activities: [{ activity: "MANUFACTURER", count: 2 }],
      verified: 2,
      price: { has: 1, request: 1 },
      attributes: [],
    },
  }),
}));

import { ProductDiscoverySection } from "../product-discovery-section";

const product = (i: number, over: Record<string, unknown> = {}) => ({
  slug: `urun-${i}`,
  name: `Ürün ${i}`,
  excerpt: null,
  images: [],
  unit: "adet",
  categoryId: "39121000",
  priceMode: "ON_REQUEST",
  priceAmount: null,
  priceTiers: null,
  priceCurrency: "TRY",
  moq: null,
  company: { name: `Firma ${i}`, slug: `firma-${i}`, city: "Bursa", country: "TR", activities: ["MANUFACTURER"], verified: true },
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  h.search = "";
  h.result = { data: { items: [product(1, { matchesProfile: true }), product(2, { matchesProfile: false })], total: 30, page: 1, pageSize: 12 }, isLoading: false };
});

describe("ProductDiscoverySection (satınalma anasayfasına gömülü ürün dizini)", () => {
  it("bölüm #urunler, kendi arama kutusu YOK, kenar süzgeci + sayaç + sıralama; uygunluk rozeti yalnız eşleşende", () => {
    render(<ProductDiscoverySection />);
    expect(document.getElementById("urunler")).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Ürünler" })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/Ürün, marka/)).toBeNull();
    const aside = screen.getByRole("complementary", { name: "Süzgeçler" });
    expect(within(aside).getByLabelText(/^Elektrik/)).toBeInTheDocument();
    expect(within(aside).getByLabelText(/^Doğrulanmış/)).toBeInTheDocument();
    expect(screen.getByText("30 ürün bulundu")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Uygunluk" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByText("Alım kategorinizle eşleşiyor")).toHaveLength(1);
    // Sayfa boyutu 12 istenir (anasayfa).
    expect(h.lastParams).toMatchObject({ pageSize: 12 });
  });

  it("arama URL'den okunur ve satır olarak gösterilir; kaldırınca URL temizlenir", async () => {
    const user = userEvent.setup();
    h.search = "q=pano&kategori=39000000";
    render(<ProductDiscoverySection />);
    expect(screen.getByText(/Arama:/)).toHaveTextContent("pano");
    expect(h.lastParams).toMatchObject({ q: "pano", category: "39000000" });
    await user.click(screen.getByRole("button", { name: "Aramayı kaldır" }));
    expect(h.replace).toHaveBeenLastCalledWith("/company/satinalma?kategori=39000000", { scroll: false });
  });

  it("sayfalama: Sonraki sayfa numarasını URL'ye yazar (1'e düşmez)", async () => {
    const user = userEvent.setup();
    render(<ProductDiscoverySection />);
    expect(screen.getByText("Sayfa 1 / 3")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Sonraki" }));
    expect(h.replace).toHaveBeenLastCalledWith("/company/satinalma?sayfa=2", { scroll: false });
  });

  it("süzgeç tıklaması URL'ye yazar; boş sonuçta talep aç + temizle", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<ProductDiscoverySection />);
    await user.click(within(screen.getByRole("complementary", { name: "Süzgeçler" })).getByLabelText(/^Doğrulanmış/));
    expect(h.replace).toHaveBeenLastCalledWith("/company/satinalma?dogrulanmis=1", { scroll: false });
    unmount();

    h.search = "q=yok";
    h.result = { data: { items: [], total: 0, page: 1, pageSize: 12 }, isLoading: false };
    render(<ProductDiscoverySection />);
    expect(screen.getByText("Bu kriterlerle ürün yok.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Talep aç/ })).toHaveAttribute("href", "/company/satinalma/taleplerim/yeni?q=yok");
    expect(screen.getByRole("button", { name: "Filtreleri temizle" })).toBeInTheDocument();
  });
});
