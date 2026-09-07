// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SATINALMA ANASAYFASI = public anasayfanın alıcı yüzü (2026-09-07 kullanıcı
 * kararı) — AYNI bileşenler, PANEL rotaları.
 *
 * Testin kilitlediği iki şey:
 *  1. Bölümler public sıradaki gibi basılır (ürün kaydırıcısı, kategori
 *     ızgarası, firmalar, popüler kategoriler, panel ikilisi).
 *  2. ROTA SIZINTISI YOK: sayfadaki hiçbir bağlantı herkese açık pazar yeri
 *     adresine gitmez (`/urunler`, `/firma/…`, `/kayit`). Public bileşenler
 *     varsayılan olarak o adresleri üretiyor; panel kendi rotalarını prop
 *     geçmezse kullanıcı sol menüsünü kaybeder. Tek istisna `/nasil-calisir`
 *     (bilgi sayfası, panelden de açılır).
 */
const h = vi.hoisted(() => ({
  push: vi.fn(),
  products: [] as unknown[],
  companies: [] as unknown[],
}));

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
  useDiscoverSearch: () => ({ data: { items: h.products, total: 56, page: 1, pageSize: 12 } }),
  useDiscoverProducts: () => ({ data: [] }),
  useDiscoverProductFacets: () => ({
    data: {
      categories: [{ id: "39000000", name: "Elektrik", level: 1, count: 12 }],
      subCategories: [],
      cities: [],
      activities: [],
      verified: 3,
      price: { has: 1, request: 1 },
      attributes: [],
    },
  }),
  useCategorySegments: () => ({ data: [{ id: "39000000", nameTr: "Elektrik" }] }),
}));
vi.mock("@/hooks/use-company-directory", () => ({
  useCompanySearch: () => ({ data: { items: h.companies, total: 20, page: 1, pageSize: 20 } }),
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

const company = (i: number) => ({
  name: `Firma ${i}`,
  slug: `firma-${i}`,
  rothernId: `RTH-${i}`,
  city: "Bursa",
  country: "TR",
  industry: null,
  activities: [],
  logoUrl: null,
  verified: true,
  mainCategory: null,
  productCount: 3,
  productPreview: [],
  connectionStatus: "none",
});

function renderPage() {
  // Hero'daki "AI ile ara" bir `useMutation` kurar — sağlayıcı olmadan
  // React Query patlar (sayfanın kendi veri kancaları mock'lu).
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <SatinalmaDashboardPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  h.products = Array.from({ length: 8 }, (_, i) => product(i));
  h.companies = Array.from({ length: 6 }, (_, i) => company(i));
});

describe("Satınalma anasayfası", () => {
  it("public anasayfanın bölümlerini basar", () => {
    renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "Ne arıyorsunuz?" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Ürünler" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Öne çıkan/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Rothern'daki firmalar" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Popüler kategoriler" })).toBeInTheDocument();
    // Kayıt CTA'sı YOK — üye zaten giriş yapmış; ikili panel eylemlerine bağlı.
    expect(screen.getByRole("heading", { name: /Talep aç/ })).toBeInTheDocument();
  });

  it("hiçbir bağlantı herkese açık pazar yeri adresine gitmez", () => {
    renderPage();
    const leaks = Array.from(document.querySelectorAll("a[href]"))
      .map((a) => a.getAttribute("href") ?? "")
      .filter((href) => href.startsWith("/") && !href.startsWith("/company/") && href !== "/nasil-calisir");
    expect(leaks).toEqual([]);
  });
});
