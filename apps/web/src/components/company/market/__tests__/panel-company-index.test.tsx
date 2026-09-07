// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  search: "",
  replace: vi.fn(),
  push: vi.fn(),
  result: { data: undefined as unknown, isLoading: false },
  lastSearchParams: undefined as unknown,
  lastFacetParams: undefined as unknown,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: h.push, replace: h.replace }),
  useSearchParams: () => new URLSearchParams(h.search),
  usePathname: () => "/company/satinalma/firmalar",
}));
vi.mock("@/hooks/use-company-directory", () => ({
  useCompanySearch: (params: unknown) => {
    h.lastSearchParams = params;
    return h.result;
  },
  useCompanySearchFacets: (params: unknown) => {
    h.lastFacetParams = params;
    return {
      data: {
        total: 2,
        verified: 1,
        withProducts: 2,
        gold: 1,
        cities: [{ city: "Bursa", count: 2 }],
        activities: [{ activity: "MANUFACTURER", count: 2 }],
        categories: [{ id: "39000000", name: "Elektrik", count: 2 }],
      },
    };
  },
}));

import { PanelCompanyIndex } from "../panel-company-index";

const company = (i: number, over: Record<string, unknown> = {}) => ({
  name: `Firma ${i}`,
  slug: `firma-${i}`,
  rothernId: `AAAA-000${i}`,
  city: "Bursa",
  country: "TR",
  industry: "Elektrik",
  activities: ["MANUFACTURER"],
  logoUrl: null,
  verified: true,
  mainCategory: { id: "39000000", name: "Elektrik" },
  productCount: 3,
  productPreview: [],
  connectionStatus: "none",
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  h.search = "";
  h.result = {
    data: {
      items: [
        company(1, { connectionStatus: "active" }),
        company(2, { matchedProducts: [{ slug: "kablo", name: "Kablo kanalı", image: null }] }),
      ],
      total: 2,
      page: 1,
      pageSize: 20,
    },
    isLoading: false,
  };
});

describe("PanelCompanyIndex — pazar bölgesinin firma dizini", () => {
  it("kendi adresi, kırıntı, arama ve Ürünler sekmesine geçiş", () => {
    render(<PanelCompanyIndex />);
    expect(screen.getByRole("heading", { level: 1, name: "Firmalar" })).toBeInTheDocument();
    const tabs = screen.getByRole("navigation", { name: "Sonuç türü" });
    expect(within(tabs).getByRole("link", { name: /Firmalar/ })).toHaveAttribute("aria-current", "page");
    expect(within(tabs).getByRole("link", { name: /Ürünler/ })).toHaveAttribute("href", "/company/satinalma/urunler");
  });

  it("BAĞLANTI süzgeci yalnız panelde; seçim URL'ye `baglanti` yazar ve uca `connection` gider", async () => {
    const user = userEvent.setup();
    render(<PanelCompanyIndex />);
    const aside = screen.getByRole("complementary", { name: "Süzgeçler" });
    await user.click(within(aside).getByLabelText("Bağlı olduklarım"));
    expect(h.replace).toHaveBeenLastCalledWith("/company/satinalma/firmalar?baglanti=bagli", { scroll: false });

    h.search = "baglanti=bagli";
    render(<PanelCompanyIndex />);
    expect(h.lastSearchParams).toMatchObject({ connection: "connected" });
    // Sayaçlar BAĞLAMSAL: facet ucu listeyle aynı süzgeçleri alır.
    expect(h.lastFacetParams).toMatchObject({ connection: "connected" });
  });

  it("İLK YÜKLEMEDE 'bulunamadı' yazmaz — iskelet dönerken sayfa boş ilan edilmez", () => {
    h.result = { data: undefined, isLoading: true };
    render(<PanelCompanyIndex />);
    expect(screen.getByText("Güncelleniyor…")).toBeInTheDocument();
    expect(screen.queryByText(/bulunamadı/)).toBeNull();
    // Sekme rozetinde de "0" basılmaz (sayı henüz bilinmiyor).
    const tabs = screen.getByRole("navigation", { name: "Sonuç türü" });
    expect(within(tabs).queryByText("0")).toBeNull();
  });

  it("bağlantı durumu rozeti pazar listesinde de görünür", () => {
    render(<PanelCompanyIndex />);
    expect(screen.getByText("Bağlısınız")).toBeInTheDocument();
  });

  it("arama varsa kartta 'Aramanıza uyan' ürün şeridi çizilir", () => {
    h.search = "q=kablo";
    render(<PanelCompanyIndex />);
    expect(screen.getByText("Aramanıza uyan")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Kablo kanalı/ })).toHaveAttribute(
      "href",
      "/company/satinalma/urunler/firma-2/kablo",
    );
  });

  it("arama yokken şerit çizilmez (eşleşme kavramı yok)", () => {
    render(<PanelCompanyIndex />);
    expect(screen.queryByText("Aramanıza uyan")).toBeNull();
  });
});
