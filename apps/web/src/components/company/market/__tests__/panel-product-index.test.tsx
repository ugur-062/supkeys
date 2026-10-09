// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  search: "",
  replace: vi.fn(),
  push: vi.fn(),
  result: { data: undefined as unknown, isLoading: false } as {
    data: unknown;
    isLoading: boolean;
    isPending?: boolean;
    isError?: boolean;
    refetch?: () => void;
  },
  lastParams: undefined as unknown,
  companyTotal: 20,
  companyParams: undefined as unknown,
  selectedCategory: null as { id: string; name: string; level: number } | null,
  perms: ["buy:view", "buy:listing:manage", "buy:inquiry:send"] as string[],
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
vi.mock("@/hooks/use-company-auth", () => ({
  useHasCompanyPermission: (p: string) => h.perms.includes(p),
}));
vi.mock("@/hooks/use-company-directory", () => ({
  useCompanySearch: (params: unknown) => {
    h.companyParams = params;
    return { data: { items: [], total: h.companyTotal, page: 1, pageSize: 20 } };
  },
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
  h.perms = ["buy:view", "buy:listing:manage", "buy:inquiry:send"];
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
  it("DÜZ başlık + SONUÇ TÜRÜ SEKMESİ (Ürünler | Firmalar); band ve arama kutusu YOK", () => {
    // Koyu bant ve bandın arama kutusu 2026-09-07'de kalktı (arama hero'da).
    // 2026-09-08: sonuç türü sekmesi geri geldi — kullanıcı isteği, kaynak
    // kalıp: aynı sorgunun iki yüzü (ürün / tedarikçi) tek satırda sayısıyla.
    render(<PanelProductIndex />);
    expect(screen.getByRole("heading", { level: 1, name: "Ürünler" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Yol" })).toBeInTheDocument();
    expect(screen.queryByRole("searchbox", { name: "Ara" })).toBeNull();
    const tabs = screen.getByRole("navigation", { name: "Sonuç türü" });
    expect(within(tabs).getByRole("link", { name: /Ürünler ve hizmetler/ })).toHaveAttribute("aria-current", "page");
    expect(within(tabs).getByRole("link", { name: /Firmalar/ })).toHaveAttribute(
      "href",
      "/company/satinalma/firmalar",
    );
  });

  it("sekme ARAMAYI ve KATEGORİYİ karşı tarafa taşır (fiyat/MOQ gibi karşılığı olmayanları değil)", () => {
    h.search = "q=pano&kategori=39000000&fiyatMax=500";
    render(<PanelProductIndex />);
    const tabs = screen.getByRole("navigation", { name: "Sonuç türü" });
    expect(within(tabs).getByRole("link", { name: /Firmalar/ })).toHaveAttribute(
      "href",
      "/company/satinalma/firmalar?q=pano&kategori=39000000",
    );
  });

  it("sekme rozeti ve adresi FİRMA süzgeçlerini (şehir, ülke, faaliyet, doğrulanmış) de taşır — '0 ürün' yanında süzgeçsiz firma sayısı yok (webA-12 yeniden doğrulama)", () => {
    // Ürün dizini şehir/ülke/faaliyet/doğrulanmış süzgecini satıcı FİRMA
    // alanından uygular; firma dizini aynı adlarla okur. Eskiden rozet ve
    // bağlantı yalnız q + kategori taşıyordu: İstanbul seçiliyken "0 ürün"
    // yanında "Firmalar 3" yazıyor, geçişte şehir sessizce düşüyordu.
    h.search = "q=vida&kategori=31000000&sehir=istanbul&ulke=TR&faaliyet=MANUFACTURER&dogrulanmis=1&fiyatMax=500";
    render(<PanelProductIndex />);
    const tabs = screen.getByRole("navigation", { name: "Sonuç türü" });
    expect(within(tabs).getByRole("link", { name: /Firmalar/ })).toHaveAttribute(
      "href",
      "/company/satinalma/firmalar?q=vida&sehir=istanbul&ulke=TR&faaliyet=MANUFACTURER&kategori=31000000&dogrulanmis=1",
    );
    // Sayı, sekmenin götürdüğü listeyle AYNI parametrelerle istenir.
    expect(h.companyParams).toMatchObject({
      q: "vida",
      city: "istanbul",
      country: "TR",
      activity: "MANUFACTURER",
      category: "31000000",
      verified: true,
    });
  });

  it("başlıkta sonuç sayısı ve kartta ülke bayrağı; rayın sonunda 'Tüm filtreleri sıfırla'", async () => {
    // Sayı BAŞLIĞIN YANINDA (referans kalıbı): araç çubuğundaki "30 ürün
    // bulundu" satırı listenin üstünde kalıyor, başlıkta katalog büyüklüğü
    // okunuyor. Bayrak firma adının önünde — SVG görseli (`CountryFlag`),
    // erişilebilir adı ülke adı; KKTC (XN) dosyasız → "KKTC" metni.
    const user = userEvent.setup();
    render(<PanelProductIndex />);
    expect(screen.getByText("30 ürün")).toBeInTheDocument();
    expect(screen.getAllByTitle("Türkiye").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("img", { name: "Türkiye" })[0]).toHaveAttribute("src", "/flags/4x3/tr.svg");

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
    h.search = "kategori=41000000";
    h.selectedCategory = { id: "41000000", name: "Laboratuvar ve Ölçüm Ekipmanları", level: 1 };
    render(<PanelProductIndex />);
    // Ad hem çipte hem kenar süzgecinde (ve mobil çekmecede) geçer.
    expect(screen.getAllByText("Laboratuvar ve Ölçüm Ekipmanları").length).toBeGreaterThan(0);
    expect(screen.queryByText("41000000")).toBeNull();
  });

  // 2026-10-09 (sahip kararı; arayüz denetimi W-12): gizli segment kodu süzgeç
  // değildir — panel dizini de adını ya da ham kodunu aktif çip olarak basmaz.
  it("?kategori=<gizli segment> süzgeç sayılmaz: ne ad ne ham kod çip olur", () => {
    h.search = "kategori=46000000";
    h.selectedCategory = { id: "46000000", name: "Kolluk ve Emniyet Ekipmanları", level: 1 };
    render(<PanelProductIndex />);
    expect(screen.queryByText("Kolluk ve Emniyet Ekipmanları")).toBeNull();
    expect(screen.queryByText("46000000")).toBeNull();
    const aside = screen.getByRole("complementary", { name: "Süzgeçler" });
    expect(within(aside).getByRole("button", { name: /Tüm filtreleri sıfırla/ })).toBeDisabled();
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

  it("büyük sayfa boyutu seçilip sonuçlar tek sayfaya sığınca da seçici kalır (küçük boyuta dönüş yolu)", () => {
    // Derin denetim LU-27: seçici sayfalamayla birlikte yalnız
    // `total > pageSize` iken çiziliyordu; 30 sonuçta 48 seçilince kayboluyordu.
    h.search = "adet=48";
    h.result = { ...h.result, data: { ...(h.result.data as object), total: 30, pageSize: 48 } };
    render(<PanelProductIndex />);
    expect(screen.getByLabelText("Sayfa başına")).toHaveValue("48");
  });

  it("İLK YÜKLEMEDE 'bulunamadı' yazmaz — iskelet dönerken sayfa boş ilan edilmez", () => {
    h.result = { data: undefined, isLoading: true, isPending: true };
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

  it("son sayfanın ötesinde 'Bu kriterlerle ürün yok' DEMEZ — 'Bu sayfada sonuç yok' + son sayfaya git (arayüz testi son tur webA-2)", async () => {
    // Başlık "169 ürün" derken gövde "bulunamadı" diyordu (herkese açık dizindeki webA-05 NEW-2 ile aynı çelişki).
    const user = userEvent.setup();
    h.search = "sayfa=9";
    h.result = { data: { items: [], total: 169, page: 9, pageSize: 24 }, isLoading: false };
    render(<PanelProductIndex />);
    expect(screen.queryByText("Bu kriterlerle ürün yok.")).toBeNull();
    expect(screen.getByText("Bu sayfada sonuç yok.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Son sayfaya gidin" }));
    expect(h.push).toHaveBeenLastCalledWith("/company/satinalma/urunler?sayfa=8", { scroll: false });
  });

  it("eylemler İZNE bağlı: talep açma ve bilgi isteme yetkisi yoksa düğmeler çizilmez (arayüz testi O-079, D-038)", () => {
    h.perms = ["buy:view"];
    const { unmount } = render(<PanelProductIndex />);
    expect(screen.queryAllByRole("link", { name: /Bilgi iste/ })).toHaveLength(0);
    unmount();

    h.search = "q=yok";
    h.result = { data: { items: [], total: 0, page: 1, pageSize: 24 }, isLoading: false };
    render(<PanelProductIndex />);
    expect(screen.queryByRole("link", { name: /Talep aç/ })).toBeNull();
  });

  it("liste görünümünde de 'Bilgi iste' AYRI hedeftir (#bilgi-iste), düz metin değil (D-038)", () => {
    h.search = "gorunum=liste";
    render(<PanelProductIndex />);
    const ctas = screen.getAllByRole("link", { name: /Bilgi iste/ });
    expect(ctas.length).toBeGreaterThan(0);
    expect(ctas[0]).toHaveAttribute("href", expect.stringContaining("#bilgi-iste"));
  });
});
