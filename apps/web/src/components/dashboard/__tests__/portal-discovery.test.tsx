// @vitest-environment jsdom
/**
 * Satınalma panosu "size uygun" seçkisi — YÖN + ÖZET sözleşmesi.
 *
 * En kritik iddia: satınalma paneli KENDİ tarafındaki kayıtları (ALIM
 * talepleri) "fırsat" diye HİÇ istemez; karşı tarafın sunduğu tek şey ürün
 * vitrini (satış ilanı özelliği kaldırıldı, 2026-09-04). İkincisi: anasayfa
 * LİSTE değil SEÇKİ — arama kutusu, sekme, süzgeç ve "Talep aç" YOK; en
 * fazla 3 kart + tek "Tümü" çıkışı. Satış panosunun karşılığı
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
    if (url.includes("items/discover")) return Promise.resolve({ data: [PRODUCT] });
    return Promise.resolve({ data: [] });
  });
});

describe("PortalDiscovery (satınalma seçkisi)", () => {
  it("yalnız ürün ister — en fazla 4; ilan/talep ucu HİÇ çağrılmaz", async () => {
    wrap(<PortalDiscovery />);
    await screen.findByText("Dağıtım Panosu 400A");
    const urls = h.get.mock.calls.map((c) => String(c[0]));
    expect(DISCOVERY_LIMIT).toBe(4);
    expect(urls.some((u) => u.includes("items/discover") && u.includes("limit=4"))).toBe(true);
    expect(urls.some((u) => u.includes("seller-tenders"))).toBe(false);
    expect(urls.some((u) => u.includes("type=ALIM"))).toBe(false);
  });

  it("özet: arama kutusu, sekme ve 'Talep aç' YOK; bloğun tek çıkışı var", async () => {
    wrap(<PortalDiscovery />);
    await screen.findByText("Dağıtım Panosu 400A");
    expect(screen.queryByRole("searchbox")).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button", { name: /ürün/i })).toBeNull();
    expect(screen.queryByText(/Talep aç/)).toBeNull();
    expect(screen.queryByText(/ilan/i)).toBeNull();
    expect(screen.getByRole("link", { name: /Tüm ürünler/ })).toHaveAttribute(
      "href",
      "/company/satinalma/urunler",
    );
  });

  it("ürün kartı PANEL rotasına gider ve firma rozetlerini taşır", async () => {
    wrap(<PortalDiscovery />);
    const link = await screen.findByRole("link", { name: /Dağıtım Panosu 400A/ });
    expect(link).toHaveAttribute(
      "href",
      "/company/satinalma/urunler/ikinci-firma/dagitim-panosu",
    );
    // Rozet ikon + erişilebilir ad (B7: ad ile aynı satırda, metin yok).
    expect(screen.getByLabelText("Doğrulanmış firma")).toBeInTheDocument();
    expect(screen.getByText("Üretici")).toBeInTheDocument();
  });

  it("boş envanterde tek cümle + tek eylem (Ürün Ara)", async () => {
    h.get.mockImplementation(() => Promise.resolve({ data: [] }));
    wrap(<PortalDiscovery />);
    expect(await screen.findByText("Eşleşen ürün yok.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ürün Ara" })).toBeInTheDocument();
  });
});
