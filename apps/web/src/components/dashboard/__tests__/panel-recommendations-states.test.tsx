// @vitest-environment jsdom
/**
 * ÜRÜN TAVSİYESİ ŞERİDİ — durumlar (son canlı kontrol 2026-10-10, OUTF-3).
 *
 * Şerit "boşsa hiç çizilmez" kuralıyla okuma HATASINI da boş sayıyordu:
 * kesintide satınalma anasayfası hero'nun altında bomboş kalıyordu ("Size uygun
 * ürünler" ve "Yeni eklenen ürünler" yerinde hiçbir şey yoktu). Boş yalnız
 * OKUNMUŞ ve boş yanıttır; okunamayan şeridin yerinde başlık + tek satır hata +
 * "Tekrar dene" durur.
 *
 * GERÇEK `useDiscoverSearch` kancası + gerçek QueryClient; yalnız `companyApi` sahte.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ get: vi.fn<(url: string) => Promise<{ data: unknown }>>() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/company/satinalma",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/company-auth/api", () => ({ companyApi: { get: h.get } }));
vi.mock("@/components/marketplace/product-card", () => ({
  ProductCard: ({ product }: { product: { name: string } }) => <span>{product.name}</span>,
}));

import { PanelRecommendations } from "../panel-recommendations";

const networkError = Object.assign(new Error("Network Error"), { isAxiosError: true });
const product = (n: number) => ({ slug: `urun-${n}`, name: `Ürün ${n}`, company: { slug: "acme", name: "Acme" } });
const pageOf = (count: number) => ({
  items: Array.from({ length: count }, (_, i) => product(i + 1)),
  total: count,
  page: 1,
  pageSize: 16,
});

let client: QueryClient;
const view = (mode: "match" | "fresh") =>
  render(
    <QueryClientProvider client={client}>
      <PanelRecommendations mode={mode} />
    </QueryClientProvider>,
  );

beforeEach(() => {
  h.get.mockReset();
  localStorage.clear();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(() => client.clear());

describe("PanelRecommendations — okunamayan şerit (OUTF-3)", () => {
  it.each([
    ["fresh", "Yeni eklenen ürünler"],
    ["match", "Size uygun ürünler"],
  ] as const)("%s: kesintide bölüm KAYBOLMAZ — başlık + hata satırı + 'Tekrar dene'", async (mode, title) => {
    h.get.mockRejectedValue(networkError);
    const { container } = view(mode);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Ürünler yüklenemedi.");
    expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    // Ne iskelet ne boş şerit: yerinde yalnız hata satırı.
    expect(container.querySelector(".animate-pulse")).toBeNull();
    expect(screen.queryByRole("list", { name: "Ürün şeridi" })).toBeNull();
  });

  it("'Tekrar dene' şeridi yeniden ister; API dönünce ürünler gelir", async () => {
    h.get.mockRejectedValue(networkError);
    view("fresh");
    await screen.findByRole("alert");
    h.get.mockResolvedValue({ data: pageOf(2) });
    await userEvent.setup().click(screen.getByRole("button", { name: "Tekrar dene" }));
    expect(await screen.findByText("Ürün 1")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Ürün şeridi" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("BAŞARILI ve boş yanıt: bölüm hiç çizilmez (boş kutu yok, hata da yok)", async () => {
    h.get.mockResolvedValue({ data: pageOf(0) });
    const { container } = view("fresh");
    await vi.waitFor(() => expect(h.get).toHaveBeenCalled());
    await vi.waitFor(() => expect(container.querySelector(".animate-pulse")).toBeNull());
    expect(container).toBeEmptyDOMElement();
  });
});
