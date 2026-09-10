// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SATINALMA ANASAYFASI (2026-09-08, kullanıcı kararı — geri alındı).
 *
 * Bir tur boyunca sayfa herkese açık anasayfanın kopyasıydı; kullanıcı eski
 * düzeni geri istedi: hero arama → ÜRÜN ÖNERİSİ şeridi → kategori vitrini
 * (satır başına 1 tanıtım kartı + 10 kategori) → yeni eklenenler şeridi.
 * Test iki şeyi kilitler:
 *  1. Sıra ve bloklar,
 *  2. "Satınalmada siyah yok" — birincil eylemler MAVİ (kullanıcı kuralı).
 */
const h = vi.hoisted(() => ({ push: vi.fn(), products: [] as unknown[] }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: h.push, replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/company/satinalma",
}));
vi.mock("@/hooks/use-company-auth", () => ({
  useCompanyAuth: () => ({
    company: { tier: "GOLD" },
    user: { roles: ["SATIN_ALMACI"], permissions: ["buy:view"] },
  }),
}));
vi.mock("@/hooks/use-portal-discovery", () => ({
  useDiscoverSearch: () => ({ data: { items: h.products, total: 56, page: 1, pageSize: 12 }, isLoading: false }),
  useDiscoverProducts: () => ({ data: [] }),
  useDiscoverProductFacets: () => ({
    data: {
      // Vitrin satırı 1 tanıtım + 10 kategori ister (yarım satır çizilmez).
      categories: Array.from({ length: 12 }, (_, i) => ({
        id: `${39 + i}000000`,
        name: `Sektör ${i}`,
        level: 1,
        count: 12 - i,
      })),
      subCategories: [],
      cities: [],
      activities: [],
      verified: 3,
      price: { has: 1, request: 1 },
      attributes: [],
    },
  }),
  useCategorySegments: () => ({
    data: Array.from({ length: 12 }, (_, i) => ({ id: `${39 + i}000000`, nameTr: `Sektör ${i}` })),
  }),
}));
vi.mock("@/hooks/use-company-directory", () => ({
  useCompanySearch: () => ({
    data: {
      items: [
        {
          name: "Firma A", slug: "firma-a", rothernId: "AAAA-0001", city: "Bursa", country: "TR",
          industry: null, activities: [], logoUrl: null, verified: true, mainCategory: null,
          productCount: 0, productPreview: [], topCategories: [], fastReply: false,
          connectionStatus: "none", matchedProducts: [],
        },
      ],
      total: 20, page: 1, pageSize: 20,
    },
    isLoading: false,
  }),
}));

import SatinalmaDashboardPage from "../(authed)/satinalma/page";

const product = (i: number) => ({
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
  company: { name: `Firma ${i}`, slug: `firma-${i}`, city: "Bursa", country: "TR", activities: [], verified: true },
});

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <SatinalmaDashboardPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  h.products = Array.from({ length: 6 }, (_, i) => product(i));
});

describe("Satınalma anasayfası", () => {
  it("hero arama + ürün önerisi + kategori vitrini + yeni eklenenler", () => {
    renderPage();
    // Başlık SORU kipinde ve iki satırlı (2026-09-08 kullanıcı kararı):
    // "Hangi ürün için" + portal renginde "tedarikçi arıyorsunuz?" — satış
    // panosundaki "Hangi talebe / teklif vereceksiniz?" ile simetrik.
    // NOT: erişilebilir ad tek dizeye kaynıyor — ikinci satırı ayıran şey
    // `block` sınıfı ve jsdom Tailwind'i uygulamadığı için araya boşluk
    // girmiyor. Bu yüzden ad birinci satırdan, vurgu satırı metinden bakılır.
    const h1 = screen.getByRole("heading", { level: 1, name: /Hangi ürün için/ });
    expect(h1.textContent).toContain("tedarikçi arıyorsunuz?");
    expect(screen.getByRole("heading", { name: /Size uygun ürünler|Aramalarınıza göre/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Yeni eklenen ürünler" })).toBeInTheDocument();
    expect(screen.getAllByText("Şimdi tedarikçi bulun").length).toBeGreaterThan(0);
  });

  it("'Firma' pili seçilince alttaki ürün bölümleri yerine FİRMA listesi çizilir", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("button", { name: "Firma" }));
    expect(screen.getByRole("heading", { level: 2, name: "Firmalar" })).toBeInTheDocument();
    expect(screen.getByText("Firma A")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Tümünü gör/ })).toHaveAttribute("href", "/company/satinalma/firmalar");
    expect(screen.queryByRole("heading", { name: "Yeni eklenen ürünler" })).not.toBeInTheDocument();
    // Geri "Ürün": vitrin döner.
    await user.click(screen.getByRole("button", { name: "Ürün" }));
    expect(screen.getByRole("heading", { name: "Yeni eklenen ürünler" })).toBeInTheDocument();
  });

  it("oturum belleğinde 'Firma' kapsamı varsa (firma sayfasından GERİ dönüş) liste Firma'da açılır", async () => {
    window.sessionStorage.setItem("rothern.hero-scope:satinalma", "suppliers");
    renderPage();
    expect(await screen.findByRole("heading", { level: 2, name: "Firmalar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Firma" })).toHaveAttribute("aria-pressed", "true");
    window.sessionStorage.clear();
  });

  it("SİYAH dolgu YOK — satınalmada birincil renk mavi (kullanıcı kuralı)", () => {
    const { container } = renderPage();
    const black = Array.from(container.querySelectorAll<HTMLElement>("[class]")).filter((el) =>
      /(^|\s)bg-(zinc-950|black)(\s|$)/.test(el.className),
    );
    expect(black.map((el) => el.className)).toEqual([]);
  });
});
