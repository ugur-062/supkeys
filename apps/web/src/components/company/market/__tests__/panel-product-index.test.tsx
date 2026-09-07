// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  search: "",
  replace: vi.fn(),
  push: vi.fn(),
  result: { data: undefined as unknown, isLoading: false },
  lastParams: undefined as unknown,
  companyTotal: 20,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: h.push, replace: h.replace }),
  useSearchParams: () => new URLSearchParams(h.search),
  usePathname: () => "/company/satinalma/urunler",
}));
vi.mock("@/hooks/use-portal-discovery", () => ({
  useDiscoverSearch: (params: unknown) => {
    h.lastParams = params;
    return h.result;
  },
  useDiscoverProductFacets: () => ({
    data: {
      categories: [{ id: "39000000", name: "Elektrik", level: 1, count: 2 }],
      subCategories: [],
      cities: [{ city: "Bursa", count: 2 }],
      activities: [{ activity: "MANUFACTURER", count: 2 }],
      verified: 2,
      price: { has: 1, request: 1 },
      attributes: [],
    },
  }),
}));
vi.mock("@/hooks/use-company-directory", () => ({
  useCompanySearch: () => ({ data: { items: [], total: h.companyTotal, page: 1, pageSize: 20 } }),
}));

import { PanelProductIndex } from "../panel-product-index";

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
  h.companyTotal = 20;
  h.result = {
    data: {
      items: [product(1, { matchesProfile: true, features: ["Güç: 400 kVAr"] }), product(2, { matchesProfile: false })],
      total: 30,
      page: 1,
      pageSize: 24,
    },
    isLoading: false,
  };
});

describe("PanelProductIndex — pazar bölgesinin ürün dizini", () => {
  it("kendi adresinde yaşar: koyu bant + kırıntı + arama + iki sekmede iki sayı", () => {
    render(<PanelProductIndex />);
    expect(screen.getByRole("heading", { level: 1, name: "Ürünler" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Yol" })).toBeInTheDocument();
    // Liste artık anasayfada değil; kendi arama kutusu ŞART.
    expect(screen.getByRole("searchbox", { name: "Ara" })).toBeInTheDocument();
    const tabs = screen.getByRole("navigation", { name: "Sonuç türü" });
    expect(within(tabs).getByRole("link", { name: /Ürünler/ })).toHaveAttribute("aria-current", "page");
    expect(within(tabs).getByRole("link", { name: /Firmalar/ })).toHaveAttribute(
      "href",
      "/company/satinalma/firmalar",
    );
    expect(within(tabs).getByText("20")).toBeInTheDocument();
  });

  it("kenar süzgeci + sayaç + sıralama; uygunluk rozeti ve özellik maddesi yalnız verilende", () => {
    render(<PanelProductIndex />);
    const aside = screen.getByRole("complementary", { name: "Süzgeçler" });
    expect(within(aside).getByLabelText(/^Elektrik/)).toBeInTheDocument();
    expect(screen.getByText("30 ürün bulundu")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Uygunluk" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByText("Alım kategorinizle eşleşiyor")).toHaveLength(1);
    expect(screen.getByText("Güç: 400 kVAr")).toBeInTheDocument();
  });

  it("süzgeç REPLACE, sayfa PUSH: geri tuşu on kutucuk değil bir sayfa geri gider", async () => {
    const user = userEvent.setup();
    render(<PanelProductIndex />);
    await user.click(within(screen.getByRole("complementary", { name: "Süzgeçler" })).getByLabelText(/^Doğrulanmış/));
    expect(h.replace).toHaveBeenLastCalledWith("/company/satinalma/urunler?dogrulanmis=1", { scroll: false });

    await user.click(screen.getByRole("button", { name: "Sayfa 2" }));
    expect(h.push).toHaveBeenLastCalledWith("/company/satinalma/urunler?sayfa=2", { scroll: false });
  });

  it("sayfa başına seçimi URL'ye `adet` olarak yazılır ve uca pageSize gider", async () => {
    const user = userEvent.setup();
    render(<PanelProductIndex />);
    expect(h.lastParams).toMatchObject({ pageSize: 24 });
    await user.selectOptions(screen.getByLabelText("Sayfa başına"), "48");
    expect(h.replace).toHaveBeenLastCalledWith("/company/satinalma/urunler?adet=48", { scroll: false });
  });

  it("boş sonuçta talep aç + filtre temizle; arama tek başınaysa 'Aramayı kaldır'", () => {
    h.search = "q=yok";
    h.result = { data: { items: [], total: 0, page: 1, pageSize: 24 }, isLoading: false };
    const { unmount } = render(<PanelProductIndex />);
    expect(screen.getByText("Bu kriterlerle ürün yok.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Talep aç/ })).toHaveAttribute(
      "href",
      "/company/satinalma/taleplerim/yeni?q=yok",
    );
    // Süzgeç yokken "Filtreleri temizle" hiçbir şey yapmazdı — doğru eylem bu.
    expect(screen.getByRole("button", { name: "Aramayı kaldır" })).toBeInTheDocument();
    unmount();

    h.search = "q=yok&dogrulanmis=1";
    render(<PanelProductIndex />);
    expect(screen.getByRole("button", { name: "Filtreleri temizle" })).toBeInTheDocument();
  });
});
