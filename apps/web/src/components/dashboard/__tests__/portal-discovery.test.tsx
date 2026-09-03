// @vitest-environment jsdom
/**
 * Satınalma panosu "size uygun" seçkisi — YÖN + ÖZET sözleşmesi.
 *
 * En kritik iddia: satınalma paneli SATIŞ ilanlarını ister (yön ters dönerse
 * kullanıcı kendi tarafındaki kayıtları "fırsat" sanır). İkincisi: anasayfa
 * LİSTE değil SEÇKİ — arama kutusu, sekme, süzgeç ve "Talep aç" YOK; her
 * blok en fazla 3 kart + tek "Tümü" çıkışı. Satış panosunun karşılığı
 * `matched-requests-widget` (kendi testi var).
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

import { DISCOVERY_LIMIT, PortalDiscovery } from "../portal-discovery";

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

const PRODUCT = {
  slug: "dagitim-panosu",
  name: "Dağıtım Panosu 400A",
  excerpt: null,
  images: ["https://cdn/p.webp"],
  unit: "adet",
  categoryId: "39000000",
  priceMode: "ON_REQUEST",
  priceAmount: null,
  priceTiers: null,
  priceCurrency: "TRY",
  moq: null,
  company: { name: "İkinci Firma", slug: "ikinci-firma", city: "Bursa", verified: true, activities: ["MANUFACTURER"] },
};

beforeEach(() => {
  h.get.mockReset();
  h.get.mockImplementation((url: string) => {
    if (url.includes("seller-tenders")) return Promise.resolve({ data: [LISTING] });
    if (url.includes("items/discover")) return Promise.resolve({ data: [PRODUCT] });
    return Promise.resolve({ data: [] });
  });
});

describe("PortalDiscovery (satınalma seçkisi)", () => {
  it("SATIŞ ilanlarını ister — en fazla 3, yalnız açık olanlar; ALIM asla", async () => {
    wrap(<PortalDiscovery />);
    await screen.findByText("Paslanmaz çelik boru");
    const urls = h.get.mock.calls.map((c) => String(c[0]));
    expect(DISCOVERY_LIMIT).toBe(3);
    expect(
      urls.some(
        (u) =>
          u.includes("seller-tenders?type=SATIS") &&
          u.includes("limit=3") &&
          u.includes("openOnly=true"),
      ),
    ).toBe(true);
    expect(urls.some((u) => u.includes("type=ALIM"))).toBe(false);
    expect(urls.some((u) => u.includes("items/discover") && u.includes("limit=3"))).toBe(true);
  });

  it("özet: arama kutusu, sekme ve 'Talep aç' YOK; iki bloğun tek çıkışı var", async () => {
    wrap(<PortalDiscovery />);
    await screen.findByText("Paslanmaz çelik boru");
    expect(screen.queryByRole("searchbox")).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button", { name: /ürün/i })).toBeNull();
    expect(screen.queryByText(/Talep aç/)).toBeNull();
    expect(screen.getByRole("link", { name: /Tüm ilanlar/ })).toHaveAttribute(
      "href",
      "/company/satinalma/satin-al",
    );
    expect(screen.getByRole("link", { name: /Tüm ürünler/ })).toHaveAttribute(
      "href",
      "/company/satinalma/urunler",
    );
  });

  it("ilan kartı: davet ve eşleşme rozetleri, şehir; kapak yoksa GÖRSEL ALANI YOK", async () => {
    wrap(<PortalDiscovery />);
    expect(await screen.findByText("Size özel davet")).toBeInTheDocument();
    expect(screen.getByText("Profilinizle eşleşti")).toBeInTheDocument();
    // Şehir kimlik değil nitelik — maskeli kartta bile kalır.
    expect(screen.getByText(/İzmir/)).toBeInTheDocument();
    // Görsel kuralı: kapaksız ilan kartında img/placeholder alanı yok.
    const card = screen.getByRole("link", { name: /Paslanmaz çelik boru/ });
    expect(card.querySelector("img")).toBeNull();
  });

  it("ürün kartı PANEL rotasına gider ve firma rozetlerini taşır", async () => {
    wrap(<PortalDiscovery />);
    const link = await screen.findByRole("link", { name: /Dağıtım Panosu 400A/ });
    expect(link).toHaveAttribute(
      "href",
      "/company/satinalma/urunler/ikinci-firma/dagitim-panosu",
    );
    expect(screen.getByText("Doğrulanmış")).toBeInTheDocument();
    expect(screen.getByText("Üretici")).toBeInTheDocument();
  });

  it("boş envanterde tek cümle + tek eylem (kategori düzenle / Ürün Ara)", async () => {
    h.get.mockImplementation(() => Promise.resolve({ data: [] }));
    wrap(<PortalDiscovery />);
    expect(await screen.findByText("Size özel ilan yok.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Alış kategorilerini düzenle" })).toHaveAttribute(
      "href",
      "/company/ayarlar/firma#kategoriler",
    );
    expect(screen.getByText("Eşleşen ürün yok.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ürün Ara" })).toBeInTheDocument();
  });
});
