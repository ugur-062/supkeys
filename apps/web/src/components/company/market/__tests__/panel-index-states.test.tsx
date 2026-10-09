// @vitest-environment jsdom
/**
 * PANEL ÜRÜN ve FİRMA DİZİNİ — liste durumları (canlı doğrulama 2026-10-09, OUTR-3).
 *
 * GERÇEK kancalar (`useDiscoverSearch`, `useDiscoverProductFacets`,
 * `useCompanySearch`, `useCompanySearchFacets`) + gerçek QueryClient; yalnız
 * `companyApi` sahte. Kesintide Ürünler "Bu kriterlerle ürün yok." + "Talep aç —
 * tedarikçiler teklif versin", Firmalar "Firma bulunamadı" + "Bu kriterlerle
 * firma yok." diyordu; hata kartı yoktu, süzgeç sütunu "Süzgeçler yükleniyor…"da
 * kalıyordu.
 */
import { QueryClient, QueryClientProvider, onlineManager } from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  get: vi.fn<(url: string) => Promise<{ data: unknown }>>(),
  search: "",
  path: "/company/satinalma/urunler",
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(h.search),
  usePathname: () => h.path,
}));
vi.mock("@/lib/company-auth/api", () => ({ companyApi: { get: h.get } }));
vi.mock("@/hooks/use-company-auth", () => ({
  useHasCompanyPermission: () => true,
}));

import { PanelCompanyIndex } from "../panel-company-index";
import { PanelProductIndex } from "../panel-product-index";

const networkError = Object.assign(new Error("Network Error"), { isAxiosError: true });

const product = (i: number) => ({
  slug: `urun-${i}`,
  name: `Ürün ${i}`,
  excerpt: null,
  images: [],
  unit: "adet",
  categoryId: "31161500",
  priceMode: "ON_REQUEST",
  priceAmount: null,
  priceTiers: null,
  priceCurrency: "TRY",
  moq: null,
  company: { name: `Firma ${i}`, slug: `firma-${i}`, city: "Bursa", country: "TR", activities: ["MANUFACTURER"], verified: true },
});
const company = (i: number) => ({
  name: `Firma ${i}`,
  slug: `firma-${i}`,
  rothernId: `AAAA-000${i}`,
  city: "Bursa",
  country: "TR",
  industry: "Elektrik",
  activities: ["MANUFACTURER"],
  logoUrl: null,
  verified: true,
  mainCategory: { id: "31000000", name: "İmalat Bileşenleri" },
  productCount: 1,
  productPreview: [
    { slug: "p1", name: "Altıgen cıvata", image: null, moq: "5", unit: "adet", priceAmount: "12", priceCurrency: "TRY", priceMode: "FIXED" },
  ],
  topCategories: [{ id: "31161500", name: "Vidalar", count: 3 }],
  fastReply: false,
  connectionStatus: "none",
});
const productFacets = {
  categories: [{ id: "31000000", name: "İmalat Bileşenleri", level: 1, count: 2 }],
  selectedCategory: null,
  subCategories: [],
  cities: [{ city: "Bursa", count: 2 }],
  activities: [{ activity: "MANUFACTURER", count: 2 }],
  verified: 2,
  price: { has: 1, request: 1 },
  attributes: [],
};
const companyFacets = {
  total: 2,
  verified: 1,
  withProducts: 2,
  gold: 1,
  cities: [{ city: "Bursa", count: 2 }],
  activities: [{ activity: "MANUFACTURER", count: 2 }],
  categories: [{ id: "31000000", name: "İmalat Bileşenleri", count: 2 }],
};

/** API ayakta: uç başına sabit yanıt. */
function apiUp(over: { products?: unknown[]; companies?: unknown[] } = {}) {
  const products = over.products ?? [product(1), product(2)];
  const companies = over.companies ?? [company(1), company(2)];
  h.get.mockImplementation(async (url: string) => {
    if (url.startsWith("/company/items/discover/search"))
      return { data: { items: products, total: products.length, page: 1, pageSize: 24 } };
    if (url.startsWith("/company/items/discover/facets")) return { data: productFacets };
    if (url.startsWith("/company/directory/search/facets")) return { data: companyFacets };
    if (url.startsWith("/company/directory/search"))
      return { data: { items: companies, total: companies.length, page: 1, pageSize: 20 } };
    return { data: [] };
  });
}
const apiDown = () => h.get.mockRejectedValue(networkError);
const callsTo = (prefix: string) => h.get.mock.calls.filter(([url]) => String(url).startsWith(prefix)).length;

let client: QueryClient;
const mount = (ui: React.ReactElement) => render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
const rail = () => within(screen.getByRole("complementary", { name: "Süzgeçler" }));
/** İçerik alanındaki hata kartı (raydaki tek satırlık hata ayrı bir `alert`). */
const errorCard = async () => {
  const card = (await screen.findByText("Bir şeyler ters gitti")).closest<HTMLElement>('[role="alert"]');
  expect(card).not.toBeNull();
  return card!;
};

beforeEach(() => {
  h.get.mockReset();
  h.search = "";
  h.path = "/company/satinalma/urunler";
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(() => {
  onlineManager.setOnline(true);
  client.clear();
});

describe("PanelProductIndex — kesinti (OUTR-3)", () => {
  it("'Bu kriterlerle ürün yok' ve 'Talep aç' düğmesi YOK; hata kartı + Tekrar dene", async () => {
    apiDown();
    mount(<PanelProductIndex />);
    const card = await errorCard();
    expect(screen.queryByText("Bu kriterlerle ürün yok.")).toBeNull();
    expect(screen.queryByRole("link", { name: /Talep aç/ })).toBeNull();
    expect(screen.queryByText(/bulunamadı/)).toBeNull();
    // Başlıkta ve sekme rozetinde sayı yok (okunamayan toplam 0 değildir).
    expect(screen.queryByText(/^\d+ ürün$/)).toBeNull();
    expect(within(screen.getByRole("navigation", { name: "Sonuç türü" })).queryByText("0")).toBeNull();

    apiUp();
    await userEvent.setup().click(within(card).getByRole("button", { name: "Tekrar dene" }));
    expect((await screen.findAllByText("Ürün 1")).length).toBeGreaterThan(0);
    expect(screen.queryByText("Bir şeyler ters gitti")).toBeNull();
  });

  it("süzgeç sütunu 'yükleniyor'da kalmaz: nedenini söyler ve yeniden denetir", async () => {
    apiDown();
    mount(<PanelProductIndex />);
    await waitFor(() => expect(rail().getByRole("alert")).toHaveTextContent("Süzgeçler yüklenemedi."));
    expect(rail().queryByText("Süzgeçler yükleniyor…")).toBeNull();

    const before = callsTo("/company/items/discover/facets");
    apiUp();
    await userEvent.setup().click(rail().getByRole("button", { name: "Tekrar dene" }));
    await waitFor(() => expect(callsTo("/company/items/discover/facets")).toBeGreaterThan(before));
    await waitFor(() => expect(rail().queryByRole("alert")).toBeNull());
  });

  it("arama + süzgeç uygulanmışken de kesinti 'ürün yok' + 'Filtreleri temizle'ye dönmez", async () => {
    h.search = "q=vida&sehir=bursa";
    apiDown();
    mount(<PanelProductIndex />);
    await errorCard();
    expect(screen.queryByText("Bu kriterlerle ürün yok.")).toBeNull();
    expect(screen.queryByRole("button", { name: "Filtreleri temizle" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Aramayı kaldır" })).toBeNull();
  });

  it("çevrimdışı duraklayan sorgu (istek yok, hata yok, veri yok): iskelet, 'ürün yok' yok", async () => {
    onlineManager.setOnline(false);
    apiDown();
    const { container } = mount(<PanelProductIndex />);
    await act(async () => {});
    expect(h.get).not.toHaveBeenCalled();
    expect(screen.queryByText("Bu kriterlerle ürün yok.")).toBeNull();
    expect(screen.queryByText(/bulunamadı/)).toBeNull();
    expect(screen.queryByText("Bir şeyler ters gitti")).toBeNull();
    expect(screen.getByText("Güncelleniyor…")).toBeInTheDocument();
    expect(rail().getByText("Süzgeçler yükleniyor…")).toBeInTheDocument();
    expect(container.querySelector(".animate-pulse")).not.toBeNull();
  });

  it("başarılı ve BOŞ yanıt boş durumu çizer (boş durum yalnız buradan)", async () => {
    apiUp({ products: [] });
    mount(<PanelProductIndex />);
    expect(await screen.findByText("Bu kriterlerle ürün yok.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Talep aç/ })).toBeInTheDocument();
  });

  it("arka plan yenilemesi düşünce ekrandaki ürünler ve sayı kalır", async () => {
    apiUp();
    mount(<PanelProductIndex />);
    expect((await screen.findAllByText("Ürün 1")).length).toBeGreaterThan(0);
    expect(screen.getByText("2 ürün")).toBeInTheDocument();

    apiDown();
    await act(async () => {
      await client.refetchQueries({ queryKey: ["company-items", "discover-search"] });
    });
    await waitFor(() =>
      expect(client.getQueryCache().find({ queryKey: ["company-items", "discover-search"], exact: false })?.state.status).toBe(
        "error",
      ),
    );
    expect(screen.queryByText("Bir şeyler ters gitti")).toBeNull();
    expect(screen.getAllByText("Ürün 1").length).toBeGreaterThan(0);
    expect(screen.getByText("2 ürün")).toBeInTheDocument();
  });
});

describe("PanelCompanyIndex — kesinti (OUTR-3)", () => {
  beforeEach(() => {
    h.path = "/company/satinalma/firmalar";
  });

  it.each(["satinalma", "satis"] as const)(
    "%s: 'Firma bulunamadı' ve 'Bu kriterlerle firma yok' YOK; hata kartı + Tekrar dene",
    async (portal) => {
      h.path = `/company/${portal}/firmalar`;
      apiDown();
      mount(<PanelCompanyIndex portal={portal} />);
      const card = await errorCard();
      expect(screen.queryByText("Firma bulunamadı")).toBeNull();
      expect(screen.queryByText("Bu kriterlerle firma yok.")).toBeNull();
      expect(screen.queryByText(/^\d+ firma$/)).toBeNull();
      await waitFor(() => expect(rail().getByRole("alert")).toHaveTextContent("Süzgeçler yüklenemedi."));

      apiUp();
      await userEvent.setup().click(within(card).getByRole("button", { name: "Tekrar dene" }));
      expect((await screen.findAllByText("Firma 1")).length).toBeGreaterThan(0);
      expect(screen.getByText("2 firma bulundu")).toBeInTheDocument();
    },
  );

  it("çevrimdışı duraklayan sorgu: iskelet + 'Güncelleniyor…', 'firma yok' yok", async () => {
    onlineManager.setOnline(false);
    apiDown();
    const { container } = mount(<PanelCompanyIndex />);
    await act(async () => {});
    expect(screen.queryByText("Firma bulunamadı")).toBeNull();
    expect(screen.queryByText("Bu kriterlerle firma yok.")).toBeNull();
    expect(screen.queryByText("Bir şeyler ters gitti")).toBeNull();
    expect(screen.getByText("Güncelleniyor…")).toBeInTheDocument();
    expect(container.querySelector(".animate-pulse")).not.toBeNull();
  });

  it("başarılı ve BOŞ yanıt boş durumu çizer", async () => {
    apiUp({ companies: [] });
    mount(<PanelCompanyIndex />);
    expect(await screen.findByText("Bu kriterlerle firma yok.")).toBeInTheDocument();
    expect(screen.getByText("Firma bulunamadı")).toBeInTheDocument();
  });

  it("arka plan yenilemesi düşünce ekrandaki firmalar ve sayı kalır", async () => {
    apiUp();
    mount(<PanelCompanyIndex />);
    expect((await screen.findAllByText("Firma 1")).length).toBeGreaterThan(0);

    apiDown();
    await act(async () => {
      await client.refetchQueries({ queryKey: ["company-directory", "search"] });
    });
    await waitFor(() =>
      expect(client.getQueryCache().find({ queryKey: ["company-directory", "search"], exact: false })?.state.status).toBe(
        "error",
      ),
    );
    expect(screen.queryByText("Bir şeyler ters gitti")).toBeNull();
    expect(screen.getAllByText("Firma 1").length).toBeGreaterThan(0);
    expect(screen.getByText("2 firma bulundu")).toBeInTheDocument();
  });
});
