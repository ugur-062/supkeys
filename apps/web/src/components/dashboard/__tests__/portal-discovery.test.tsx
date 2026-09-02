// @vitest-environment jsdom
/**
 * Keşif bloğu — PORTAL YÖNÜ sözleşmesi.
 *
 * En kritik iddia: satınalma paneli SATIŞ ilanlarını, satış paneli ALIM
 * taleplerini ister. Yön ters dönerse kullanıcı kendi tarafındaki kayıtları
 * "fırsat" sanır ve blok tamamen yanlış bir dünya gösterir.
 */
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock("@/lib/company-auth/api", () => ({
  companyApi: { get: h.get },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/company/satinalma",
}));

import { PortalDiscovery } from "../portal-discovery";

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const LISTING = {
  id: "l1",
  number: "ROT-000001",
  title: "Paslanmaz çelik boru",
  status: "OPEN",
  visibility: "PUBLIC",
  format: null,
  currency: "TRY",
  isInternational: false,
  closesAt: null,
  createdAt: new Date().toISOString(),
  itemCount: 3,
  owner: { id: "c1", name: "Alfa Metal" },
  ownerCity: "İzmir",
  coverImageUrl: null,
  masked: false,
  canBid: true,
  invited: true,
  connected: false,
  myBidStatus: null,
  myBidVersion: null,
  categoryMatch: true,
  categories: [{ code: "40171501", name: "Çelik boru" }],
  extraCategoryCount: 0,
  minPrice: null,
  buyNowPrice: null,
};

beforeEach(() => {
  h.get.mockReset();
  h.get.mockImplementation((url: string) => {
    if (url.includes("discover-facets")) {
      return Promise.resolve({
        data: { segments: [{ id: "40000000", name: "Dağıtım Sistemleri", count: 2 }], total: 2 },
      });
    }
    if (url.includes("seller-tenders")) return Promise.resolve({ data: [LISTING] });
    return Promise.resolve({ data: [] });
  });
});

describe("PortalDiscovery", () => {
  it("SATINALMA paneli SATIŞ ilanlarını ister", async () => {
    wrap(<PortalDiscovery portal="satinalma" />);
    await screen.findByText("Paslanmaz çelik boru");
    const urls = h.get.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes("seller-tenders?type=SATIS"))).toBe(true);
    expect(urls.some((u) => u.includes("type=ALIM"))).toBe(false);
  });

  it("SATIŞ paneli ALIM taleplerini ister", async () => {
    wrap(<PortalDiscovery portal="satis" />);
    await screen.findByText("Paslanmaz çelik boru");
    const urls = h.get.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes("seller-tenders?type=ALIM"))).toBe(true);
    expect(urls.some((u) => u.includes("type=SATIS"))).toBe(false);
  });

  it("şeritte 6 kart ister — sıralama sunucuda, kırpma da orada", async () => {
    wrap(<PortalDiscovery portal="satis" />);
    await screen.findByText("Paslanmaz çelik boru");
    expect(
      h.get.mock.calls.some((c) => String(c[0]).includes("limit=6")),
    ).toBe(true);
  });

  it("davet ve eşleşme sinyalleri kartta görünür", async () => {
    wrap(<PortalDiscovery portal="satis" />);
    expect(await screen.findByText("Size özel davet")).toBeInTheDocument();
    // Şehir kimlik değil nitelik — maskeli kartta bile kalır.
    expect(screen.getByText(/İzmir/)).toBeInTheDocument();
  });

  it("sektör kutuları sayaçla çizilir", async () => {
    wrap(<PortalDiscovery portal="satis" />);
    expect(await screen.findByText("Dağıtım Sistemleri")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("ÜRÜNLER sekmesi yalnız satınalmada var", async () => {
    const { unmount } = wrap(<PortalDiscovery portal="satinalma" />);
    expect(await screen.findByRole("button", { name: "Ürünler" })).toBeInTheDocument();
    unmount();
    wrap(<PortalDiscovery portal="satis" />);
    await screen.findByText("Paslanmaz çelik boru");
    expect(screen.queryByRole("button", { name: "Ürünler" })).toBeNull();
  });

  it("boş envanterde hayalet ızgara değil, tek satır + yönlendirme", async () => {
    h.get.mockImplementation((url: string) =>
      url.includes("discover-facets")
        ? Promise.resolve({ data: { segments: [], total: 0 } })
        : Promise.resolve({ data: [] }),
    );
    wrap(<PortalDiscovery portal="satis" />);
    expect(
      await screen.findByText("Şu an size uygun açık talep yok."),
    ).toBeInTheDocument();
  });
});
