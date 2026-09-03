// @vitest-environment jsdom
/**
 * Keşif bloğu — YÖN sözleşmesi (yalnız SATINALMA panosu).
 *
 * En kritik iddia: satınalma paneli SATIŞ ilanlarını ister. Yön ters dönerse
 * kullanıcı kendi tarafındaki kayıtları "fırsat" sanır ve blok tamamen yanlış
 * bir dünya gösterir. Satış panosunun karşılığı `matched-requests-widget`
 * (kendi testi var) — bu blok orada artık kullanılmıyor (2026-09-03).
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
    wrap(<PortalDiscovery />);
    await screen.findByText("Paslanmaz çelik boru");
    const urls = h.get.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes("seller-tenders?type=SATIS"))).toBe(true);
    expect(urls.some((u) => u.includes("type=ALIM"))).toBe(false);
  });

  it("şeritte 6 kart ister — sıralama sunucuda, kırpma da orada", async () => {
    wrap(<PortalDiscovery />);
    await screen.findByText("Paslanmaz çelik boru");
    expect(
      h.get.mock.calls.some((c) => String(c[0]).includes("limit=6")),
    ).toBe(true);
  });

  it("davet ve eşleşme sinyalleri kartta görünür", async () => {
    wrap(<PortalDiscovery />);
    expect(await screen.findByText("Size özel davet")).toBeInTheDocument();
    // Şehir kimlik değil nitelik — maskeli kartta bile kalır.
    expect(screen.getByText(/İzmir/)).toBeInTheDocument();
  });

  it("sektör kutuları sayaçla çizilir", async () => {
    wrap(<PortalDiscovery />);
    expect(await screen.findByText("Dağıtım Sistemleri")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("ÜRÜN sekmesi 'Ürünlerim' ile karışmaz", async () => {
    // Ad "Tedarikçi ürünleri": satıştaki "Ürünlerim" firmanın KENDİ kataloğu,
    // buradaki başkalarının vitrini — menüde yan yana okunduğunda ayırt
    // edilemiyordu (kullanıcı geri bildirimi).
    wrap(<PortalDiscovery />);
    expect(
      await screen.findByRole("button", { name: "Tedarikçi ürünleri" }),
    ).toBeInTheDocument();
  });

  it("yalnız TEKLİFE AÇIK ilanlar istenir (openOnly)", async () => {
    // Uç varsayılan olarak katıldığım KAPANMIŞ ilanları da döndürür (liste
    // sayfası Aktif/Geçmiş sekmesiyle ayırır). Şerit "teklif bekleyen" diye
    // başlıklanıyor: süzgeç olmadan açık ilan bitince kapanmış/karara
    // bağlanmış kayıtlarla dolar ve "Tümünü gör" 0 sonuç gösterirdi.
    wrap(<PortalDiscovery />);
    await screen.findByText("Paslanmaz çelik boru");
    const urls = h.get.mock.calls.map((c) => String(c[0]));
    expect(
      urls.some((u) => u.includes("seller-tenders") && u.includes("openOnly=true")),
    ).toBe(true);
  });

  it("ürün kartı PANEL rotasına gider — herkese açık sayfaya DEĞİL", async () => {
    // Kart `/firma/<slug>/urun/<slug>`e gitseydi giriş yapmış kullanıcı paneli
    // terk eder, oturumu okumayan public layout'ta "Giriş Yap / Kaydol"
    // duvarına çarpardı (canlıda gerçekleşti).
    h.get.mockImplementation((url: string) => {
      if (url.includes("discover-facets")) {
        return Promise.resolve({ data: { segments: [], total: 0 } });
      }
      if (url.includes("items/discover")) {
        return Promise.resolve({
          data: [
            {
              slug: "dagitim-panosu",
              name: "Dağıtım Panosu 400A",
              excerpt: null,
              images: [],
              unit: "adet",
              categoryId: "39000000",
              priceMode: "ON_REQUEST",
              priceAmount: null,
              priceTiers: null,
              priceCurrency: "TRY",
              moq: null,
              company: { name: "İkinci Firma", slug: "ikinci-firma", city: "Bursa" },
            },
          ],
        });
      }
      return Promise.resolve({ data: [] });
    });
    const user = userEvent.setup();
    wrap(<PortalDiscovery />);
    await user.click(
      await screen.findByRole("button", { name: "Tedarikçi ürünleri" }),
    );
    const link = await screen.findByRole("link", { name: /Dağıtım Panosu 400A/ });
    expect(link).toHaveAttribute(
      "href",
      "/company/satinalma/urunler/ikinci-firma/dagitim-panosu",
    );
  });

  it("boş envanterde hayalet ızgara değil, tek satır + yönlendirme", async () => {
    h.get.mockImplementation((url: string) =>
      url.includes("discover-facets")
        ? Promise.resolve({ data: { segments: [], total: 0 } })
        : Promise.resolve({ data: [] }),
    );
    wrap(<PortalDiscovery />);
    expect(
      await screen.findByText("Şu an size uygun satılık ilan yok."),
    ).toBeInTheDocument();
  });
});
