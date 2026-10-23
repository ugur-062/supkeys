// @vitest-environment jsdom
/**
 * SATINALMA ANASAYFASI — kesinti (son canlı kontrol 2026-10-10, OUTF-3).
 *
 * API yanıt vermezken sayfa hero'nun altında bomboş kalıyordu: iki ürün şeridi
 * de, kategori vitrini de hatayı "boş" sayıp hiçbir şey çizmiyordu. Üçünün
 * yerinde de tek satır hata + "Tekrar dene" durur (tedarikçi anasayfasının Açık
 * Talepler için yaptığı gibi).
 *
 * GERÇEK keşif kancaları + gerçek QueryClient; yalnız `companyApi` sahte. Hero
 * ve vitrinin kendi çizimi bu testin konusu değil (sahte).
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ get: vi.fn<(url: string) => Promise<{ data: unknown }>>() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/company/satinalma",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/company-auth/api", () => ({ companyApi: { get: h.get } }));
vi.mock("@/hooks/use-company-auth", () => ({
  useCompanyAuth: () => ({ user: null, company: { tier: "GOLD", name: "Acme", slug: "acme" } }),
  useHasCompanyPermission: () => true,
}));
vi.mock("@/components/dashboard/panel-hero-search", () => ({
  PanelHeroSearch: ({ title }: { title: string }) => <h1>{title}</h1>,
}));
vi.mock("@/components/dashboard/category-showcase-rows", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/dashboard/category-showcase-rows")>();
  return {
    ...actual,
    CategoryShowcaseRows: ({ rows }: { rows: { promo: { name: string } }[] }) => (
      <section aria-label="Kategori vitrini">{rows.map((r) => r.promo.name).join(" · ")}</section>
    ),
  };
});
vi.mock("@/components/marketplace/product-card", () => ({
  ProductCard: ({ product }: { product: { name: string } }) => <span>{product.name}</span>,
}));

import SatinalmaDashboardPage from "../page";

const networkError = Object.assign(new Error("Network Error"), { isAxiosError: true });
const SEGMENTS = [
  { id: "31000000", nameTr: "İmalat Bileşenleri", slug: "imalat-bilesenleri" },
  { id: "39000000", nameTr: "Elektrik Sistemleri", slug: "elektrik-sistemleri" },
];
const PRODUCTS = {
  items: [{ slug: "vida-m8", name: "Vida M8", company: { slug: "acme", name: "Acme" } }],
  total: 1,
  page: 1,
  pageSize: 16,
};

/** API ayakta: sektörler, sayaçlar ve ürün şeritleri yanıt verir. */
function apiUp() {
  h.get.mockImplementation(async (url: string) => {
    if (url.startsWith("/categories/segments")) return { data: SEGMENTS };
    if (url.startsWith("/company/items/discover/facets")) return { data: { categories: [] } };
    if (url.startsWith("/company/items/discover/search")) return { data: PRODUCTS };
    return { data: [] };
  });
}
const apiDown = () => h.get.mockRejectedValue(networkError);

let client: QueryClient;
const view = () =>
  render(
    <QueryClientProvider client={client}>
      <SatinalmaDashboardPage />
    </QueryClientProvider>,
  );

beforeEach(() => {
  h.get.mockReset();
  localStorage.clear();
  sessionStorage.clear();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(() => client.clear());

describe("Satınalma anasayfası — kesinti (OUTF-3)", () => {
  it("hero'nun altı BOŞ kalmaz: iki şerit ve kategori vitrini yerinde hata + 'Tekrar dene'", async () => {
    apiDown();
    view();
    await waitFor(() => expect(screen.getAllByRole("alert")).toHaveLength(3));
    const texts = screen.getAllByRole("alert").map((a) => a.textContent);
    expect(texts.filter((x) => x?.includes("Ürünler yüklenemedi."))).toHaveLength(2);
    expect(texts.filter((x) => x?.includes("Kategoriler yüklenemedi."))).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Tekrar dene" })).toHaveLength(3);
    // Okunamayan vitrin boş satırlarla çizilmez.
    expect(screen.queryByRole("region", { name: "Kategori vitrini" })).toBeNull();
  });

  it("vitrinin 'Tekrar dene'si sektörleri yeniden ister; API dönünce vitrin gelir", async () => {
    apiDown();
    view();
    const alert = await screen.findByText(/Kategoriler yüklenemedi\./);
    apiUp();
    await userEvent.setup().click(alert.querySelector("button")!);
    await waitFor(() =>
      expect(screen.getByRole("region", { name: "Kategori vitrini" })).toHaveTextContent("İmalat Bileşenleri"),
    );
    expect(screen.queryByText(/Kategoriler yüklenemedi\./)).toBeNull();
  });

  it("API ayaktayken hata satırı yok: şeritler ve vitrin çizilir", async () => {
    apiUp();
    view();
    await waitFor(() =>
      expect(screen.getByRole("region", { name: "Kategori vitrini" })).toHaveTextContent("İmalat Bileşenleri"),
    );
    expect((await screen.findAllByText("Vida M8")).length).toBeGreaterThan(0);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
