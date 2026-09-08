// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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
  useCompanySearch: () => ({ data: { items: [], total: 20, page: 1, pageSize: 20 } }),
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
    // Başlık iki satırlı (2026-09-08 kullanıcı tasarımı): "Daha güçlü iş
    // bağlantıları" + portal renginde "daha büyük fırsatlar".
    expect(
      screen.getByRole("heading", { level: 1, name: /Daha güçlü iş bağlantıları/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Size uygun ürünler|Aramalarınıza göre/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Yeni eklenen ürünler" })).toBeInTheDocument();
    expect(screen.getAllByText("Şimdi tedarikçi bulun").length).toBeGreaterThan(0);
  });

  it("SİYAH dolgu YOK — satınalmada birincil renk mavi (kullanıcı kuralı)", () => {
    const { container } = renderPage();
    const black = Array.from(container.querySelectorAll<HTMLElement>("[class]")).filter((el) =>
      /(^|\s)bg-(zinc-950|black)(\s|$)/.test(el.className),
    );
    expect(black.map((el) => el.className)).toEqual([]);
  });
});
