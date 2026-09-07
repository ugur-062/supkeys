// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  search: "",
  replace: vi.fn(),
  push: vi.fn(),
  result: { data: undefined as unknown, isLoading: false },
  lastParams: undefined as unknown,
  companyTotal: 20,
  selectedCategory: null as { id: string; name: string; level: number } | null,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: h.push, replace: h.replace }),
  useSearchParams: () => new URLSearchParams(h.search),
  usePathname: () => "/company/satinalma/urunler",
}));
vi.mock("@/hooks/use-portal-discovery", () => ({
  useDiscoverSearch: (params: unknown) => {
    h.lastParams = params;
    return h.result;
  },
  useDiscoverProductFacets: () => ({
    data: {
      categories: [{ id: "39000000", name: "Elektrik", level: 1, count: 2 }],
      selectedCategory: h.selectedCategory,
      subCategories: [],
      cities: [{ city: "Bursa", count: 2 }],
      activities: [{ activity: "MANUFACTURER", count: 2 }],
      verified: 2,
      price: { has: 1, request: 1 },
      attributes: [],
    },
  }),
}));
vi.mock("@/hooks/use-company-directory", () => ({
  useCompanySearch: () => ({ data: { items: [], total: h.companyTotal, page: 1, pageSize: 20 } }),
}));

import { PanelProductIndex } from "../panel-product-index";

const product = (i: number, over: Record<string, unknown> = {}) => ({
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
  company: { name: `Firma ${i}`, slug: `firma-${i}`, city: "Bursa", country: "TR", activities: ["MANUFACTURER"], verified: true },
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  h.search = "";
  h.selectedCategory = null;
  h.companyTotal = 20;
  h.result = {
    data: {
      items: [product(1, { matchesProfile: true, features: ["Güç: 400 kVAr"] }), product(2, { matchesProfile: false })],
      total: 30,
      page: 1,
      pageSize: 24,
    },
    isLoading: false,
  };
});

describe("PanelProductIndex — pazar bölgesinin ürün dizini", () => {
  it("kendi adresinde yaşar: DÜZ başlık (kırıntı + H1) — koyu bant, açıklama, arama ve sekmeler YOK", () => {
    // 2026-09-07 (kullanıcı kararı): koyu bant kaldırıldı. Başlık +
    // açıklama + arama + "Ürünler | Firmalar" sekmeleri birlikte ürün
    // ızgarasını ekranın altına itiyordu; arama anasayfadaki büyük kutuda
    // yaşıyor ve `?q=` ile bu listeye yazıyor.
    render(<PanelProductIndex />);
    expect(screen.getByRole("heading", { level: 1, name: "Ürünler" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Yol" })).toBeInTheDocument();
    expect(screen.queryByRole("searchbox", { name: "Ara" })).toBeNull();
    expect(screen.queryByRole("navigation", { name: "Sonuç türü" })).toBeNull();
    // Firma dizinine giriş noktası KALIR: sekmeler kalkınca /firmalar
    // yalnız Bağlantılar › Keşfet'ten erişilebilir kalırdı.
    expect(screen.getByRole("link", { name: /^Firmalar/ })).toHaveAttribute(
      "href",
      "/company/satinalma/firmalar",
    );
  });

  it("başlıkta sonuç sayısı ve kartta ülke bayrağı; rayın sonunda 'Tüm filtreleri sıfırla'", async () => {
    // Sayı BAŞLIĞIN YANINDA (referans kalıbı): araç çubuğundaki "30 ürün
    // bulundu" satırı listenin üstünde kalıyor, başlıkta katalog büyüklüğü
    // okunuyor. Bayrak firma adının önünde — KKTC (XN) ISO'da olmadığı için
    // orada bayrak basılmaz (bkz. `countryFlag`).
    const user = userEvent.setup();
    render(<PanelProductIndex />);
    expect(screen.getByText("30 ürün")).toBeInTheDocument();
    expect(screen.getAllByTitle("Türkiye").length).toBeGreaterThan(0);

    const aside = screen.getByRole("complementary", { name: "Süzgeçler" });
    const clearAll = within(aside).getByRole("button", { name: /Tüm filtreleri sıfırla/ });
    // Süzgeç yokken düğme YERİNDE ama devre dışı (ray hep aynı yerde bitsin).
    expect(clearAll).toBeDisabled();

    await user.click(within(aside).getByLabelText(/^Doğrulanmış/));
    expect(h.push).toHaveBeenLastCalledWith("/company/satinalma/urunler?dogrulanmis=1", { scroll: false });
  });

  it("aktif süzgeç çipi kategori ADINI yazar — ürünü olmayan/L3 dalda da (ham kod DEĞİL)", () => {
    // 2026-09-08 kullanıcı bulgusu: ürünü olmayan bir dal seçilince çipte
    // "45000000" yazıyordu. Ad `categories` listesinde aranıyordu; o liste
    // yalnız L1 segmentleri ve YALNIZ ürünü olanları taşır. Sunucu artık
    // seçili kategoriyi ayrı alanda döndürüyor.
    h.search = "kategori=45000000";
    h.selectedCategory = { id: "45000000", name: "Baskı, Fotoğraf ve Ses-Video", level: 1 };
    render(<PanelProductIndex />);
    // Ad hem çipte hem kenar süzgecinde (ve mobil çekmecede) geçer.
    expect(screen.getAllByText("Baskı, Fotoğraf ve Ses-Video").length).toBeGreaterThan(0);
    expect(screen.queryByText("45000000")).toBeNull();
  });

  it("kenar süzgeci + sayaç + sıralama; uygunluk rozeti ve özellik maddesi yalnız verilende", () => {
    render(<PanelProductIndex />);
    const aside = screen.getByRole("complementary", { name: "Süzgeçler" });
    expect(within(aside).getByLabelText(/^Elektrik/)).toBeInTheDocument();
    expect(screen.getByText("30 ürün bulundu")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Uygunluk" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByText("Alım kategorinizle eşleşiyor")).toHaveLength(1);
    expect(screen.getByText("Güç: 400 kVAr")).toBeInTheDocument();
  });

  it("ürün dizininde süzgeç de PUSH: geri tuşu son kutucuğu geri alır", async () => {
    // 2026-09-07 (kullanıcı kararı): 9 süzgeç grubu geldiğinde yanlış
    // kutucuğu geri almanın yolu geri tuşu oldu. Açık talep süzgeci
    // (`FilterShellCore` varsayılanı) hâlâ `replace` — orada tıklar hızlı ve
    // ardışık, her biri geçmişe girseydi listeden çıkılamazdı.
    const user = userEvent.setup();
    render(<PanelProductIndex />);
    await user.click(within(screen.getByRole("complementary", { name: "Süzgeçler" })).getByLabelText(/^Doğrulanmış/));
    expect(h.push).toHaveBeenLastCalledWith("/company/satinalma/urunler?dogrulanmis=1", { scroll: false });

    await user.click(screen.getByRole("button", { name: "Sayfa 2" }));
    expect(h.push).toHaveBeenLastCalledWith("/company/satinalma/urunler?sayfa=2", { scroll: false });
  });

  it("tedarikçi türü TÜM tipleri listeler; veride olmayan soluk ve seçilemez", () => {
    // Eskiden yalnız facet'te geçen tipler basılıyordu: veride 2 tip olduğu
    // için kullanıcı diğerlerinin var olduğunu bilmiyordu (bulgu).
    render(<PanelProductIndex />);
    const aside = screen.getByRole("complementary", { name: "Süzgeçler" });
    expect(within(aside).getByLabelText(/^Üretici/)).toBeInTheDocument();
    const fason = within(aside).getByLabelText(/^Fason imalatçı/) as HTMLInputElement;
    expect(fason).toBeInTheDocument();
    expect(fason.disabled).toBe(true);
  });

  it("sayfa başına seçimi URL'ye `adet` olarak yazılır ve uca pageSize gider", async () => {
    const user = userEvent.setup();
    render(<PanelProductIndex />);
    expect(h.lastParams).toMatchObject({ pageSize: 24 });
    await user.selectOptions(screen.getByLabelText("Sayfa başına"), "48");
    // `pushFilters` bu sayfada URL'e yazılan HER durum değişimini kapsıyor
    // (sıralama ve sayfa başına dahil): "geri tuşu son değişikliği geri alır"
    // kuralı ancak böyle tutarlı olur.
    expect(h.push).toHaveBeenLastCalledWith("/company/satinalma/urunler?adet=48", { scroll: false });
  });

  it("İLK YÜKLEMEDE 'bulunamadı' yazmaz — iskelet dönerken sayfa boş ilan edilmez", () => {
    h.result = { data: undefined, isLoading: true };
    render(<PanelProductIndex />);
    expect(screen.getByText("Güncelleniyor…")).toBeInTheDocument();
    expect(screen.queryByText(/bulunamadı/)).toBeNull();
  });

  it("boş sonuçta talep aç + filtre temizle; arama tek başınaysa 'Aramayı kaldır'", () => {
    h.search = "q=yok";
    h.result = { data: { items: [], total: 0, page: 1, pageSize: 24 }, isLoading: false };
    const { unmount } = render(<PanelProductIndex />);
    expect(screen.getByText("Bu kriterlerle ürün yok.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Talep aç/ })).toHaveAttribute(
      "href",
      "/company/satinalma/taleplerim/yeni?q=yok",
    );
    // Süzgeç yokken "Filtreleri temizle" hiçbir şey yapmazdı — doğru eylem bu.
    expect(screen.getByRole("button", { name: "Aramayı kaldır" })).toBeInTheDocument();
    unmount();

    h.search = "q=yok&dogrulanmis=1";
    render(<PanelProductIndex />);
    expect(screen.getByRole("button", { name: "Filtreleri temizle" })).toBeInTheDocument();
  });
});
