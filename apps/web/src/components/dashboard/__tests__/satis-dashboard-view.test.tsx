// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  stats: undefined as unknown,
  statsLoading: false,
  analytics: undefined as unknown,
  /** URL search param'ları (dönem/karşılaştır/sekme) — test başına ayarlanır. */
  search: "" as string,
  user: { firstName: "Ada", permissions: ["sell:product:manage", "sell:bid:submit"] } as Record<string, unknown>,
  company: { name: "Örnek Ltd." } as Record<string, unknown>,
  push: vi.fn(),
  /** Varsayılan açık talep satırlarına eklenen satırlar (sektör önerisi sınamaları). */
  extraTenders: [] as unknown[],
}));

vi.mock("@/hooks/use-company-auth", () => ({
  useCompanyAuth: () => ({
    user: h.user,
    company: h.company,
  }),
}));
vi.mock("@/hooks/use-company-dashboard", () => ({
  useSatisAnalytics: () => ({ data: h.analytics, isLoading: false }),
  useSatisStats: () => ({ data: h.stats, isLoading: h.statsLoading }),
}));
vi.mock("@/hooks/use-company-items", () => ({
  useCatalogCounts: () => ({ data: { published: 1, draft: 0 } }),
}));
vi.mock("@/hooks/use-company-tenders", () => ({
  useTenders: () => ({ data: [{ id: "l1" }] }),
}));
// KPI'lar liste verisinden AYNI seçiciyle sayılır: satın alma tarafındaki
// sipariş "Aktif" kümesi
// Satışlarım ile birebir.
vi.mock("@/hooks/use-company-listings", () => ({
  useMyBids: () => ({
    data: [
      { id: "b1", status: "SUBMITTED", listing: { type: "ALIM", status: "OPEN" } },
      { id: "b2", status: "SUBMITTED", listing: { type: "ALIM", status: "IN_AWARD" } },
      { id: "b3", status: "SUBMITTED", listing: { type: "ALIM", status: "AWARDED" } },
      { id: "b5", status: "WON", listing: { type: "ALIM", status: "AWARDED" } },
      { id: "b6", status: "AWARDED_PARTIAL", listing: { type: "ALIM", status: "AWARDED" } },
    ],
  }),
}));
vi.mock("@/hooks/use-company-orders", () => ({
  useOrders: () => ({
    data: [
      { id: "o1", role: "seller", status: "DELIVERED", paymentSettled: false },
      { id: "o2", role: "seller", status: "COMPLETED", paymentSettled: true },
      { id: "o3", role: "buyer", status: "PENDING", paymentSettled: false },
    ],
  }),
}));
vi.mock("@/hooks/use-company-messages", () => ({
  useUnreadMessages: () => ({ data: { count: 0 } }),
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(h.search),
  usePathname: () => "/company/satis",
  useRouter: () => ({ push: h.push, replace: vi.fn() }),
}));
// Hero'daki "AI ile ara" useMutation kullanır — sağlayıcısız test kırılmasın.
const aiMutate = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-ai-search-intent", () => ({
  useAiSearchIntent: () => ({ mutate: aiMutate, isPending: false }),
}));
vi.mock("@/components/dashboard/home-company-list", () => ({
  HomeCompanyList: () => <div data-testid="company-list" />,
}));
// Aksiyon merkezi/şeridi kendi ucundan beslenir — ayrı test edilir; burada
// varlığını gözlemleyen hafif mock.
vi.mock("@/components/dashboard/action-center", () => ({
  ActionCenter: () => <div data-testid="action-center" />,
  ActionStrip: () => <div data-testid="action-strip" />,
}));
// "Size uygun açık talepler" widget'ı kendi ucundan beslenir (seller-tenders)
// ve ayrı test edilir; burada varlığını gözlemleyen hafif mock — aksi hâlde
// gerçek `useQuery` sağlayıcısız çalışıp bu suite'i kırar.
vi.mock("@/hooks/use-portal-discovery", () => ({
  useCategorySegments: () => ({
    data: [
      { id: "39000000", nameTr: "Elektrik" },
      { id: "23000000", nameTr: "Makine" },
      { id: "31000000", nameTr: "Bileşen" },
      { id: "46000000", nameTr: "İş Güvenliği ve Yangın Ekipmanları" },
    ],
    isLoading: false,
  }),
}));
vi.mock("@/hooks/use-seller-tenders", () => ({
  maskedRequestHref: (n: string) => `/company/satis/acik-talep/${n}`,
  useSellerTenders: () => ({
    data: [
      { id: "t1", number: "ROT-000001", title: "Kablo alımı", status: "OPEN", owner: { id: "c1", name: "Alıcı A" }, ownerCountry: "TR", categories: [] },
      { id: "t2", number: "ROT-000002", title: "Pano alımı", status: "OPEN", owner: { id: "c1", name: "Alıcı A" }, ownerCountry: "TR", categories: [] },
      { id: "t3", number: "ROT-000003", title: "Eski", status: "AWARDED", owner: { id: "c2", name: "Alıcı B" }, ownerCountry: null, categories: [] },
      // Ücretsiz üyenin alıcı gizli satırı (2026-10-03): ad yok, iç kimlik yok.
      { id: "masked:ROT-000004", masked: true, number: "ROT-000004", title: "Kablo makarası alımı", status: "OPEN", owner: null, ownerCountry: "TR", categories: [] },
      ...h.extraTenders,
    ],
    isLoading: false,
  }),
}));
vi.mock("@/components/company/seller-tenders-view", () => ({
  SellerTendersView: ({ banner }: { banner?: React.ReactNode }) => (
    <div data-testid="seller-tenders" id="acik-talepler">{banner}</div>
  ),
}));

import { SatisDashboardView } from "../satis-dashboard-view";

function fullStats(over: Record<string, unknown> = {}) {
  return {
    invitations: { active: 3 },
    bids: { active: 2 },
    wonTenders: 5,
    orders: { pending: 1 },
    revenue: { total: 150000, last30: 60000, prev30: 40000 },
    last30Days: { bidsSubmitted: 8, prevBidsSubmitted: 4 },
    buyers: { active: 6 },
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.stats = undefined;
  h.statsLoading = false;
  h.analytics = undefined;
  h.search = "";
  h.user = { firstName: "Ada", permissions: ["sell:product:manage", "sell:bid:submit"] };
  h.company = { name: "Örnek Ltd." };
  h.extraTenders = [];
  try {
    sessionStorage.clear();
  } catch {
    /* yok */
  }
});

describe("SatisDashboardView", () => {
  it("BAŞLIK ŞERİDİ ve 'BUGÜN' bandı anasayfada YOK (2026-09-07, kullanıcı kararı)", () => {
    h.stats = fullStats();
    h.analytics = { actions: { unansweredInvites: 3 }, deltas: {}, kpiSeries: {} };
    render(<SatisDashboardView />);

    // Panel adı sol menüde, kur çipi + bekleyen işler + 4 KPI
    // Şirketim › Genel Bakış'ta — anasayfa açık taleplere ayrıldı.
    expect(screen.queryByText("Satış paneli")).toBeNull();
    expect(screen.queryByTestId("tcmb")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Bugün" })).toBeNull();
    expect(screen.queryByTestId("action-strip")).toBeNull();
    for (const label of ["Yanıt Bekleyen Davet", "Aktif Tekliflerim", "Kazandığım İşler", "Aktif Sipariş"]) {
      expect(screen.queryByText(label)).toBeNull();
    }
  });

  it("GRAFİKLER ve dönemsel tutar kartları panoda YOK (satış raporları da kaldırıldı)", () => {
    h.stats = fullStats();
    render(<SatisDashboardView />);
    expect(screen.queryByText("Toplam Gelir")).not.toBeInTheDocument();
    expect(screen.queryByText("Bağlı Müşteri")).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Gelir" })).toBeNull();
    // Satış raporları satış ilanıyla birlikte kaldırıldı — bağlantı da yok.
    expect(screen.queryByRole("link", { name: /Raporlar/ })).toBeNull();
  });

  it("arama kutusu ilk ekranda açık talepleri arar; sektör çipleri ve fotoğraflı sektör kartları YOK (2026-09-05)", () => {
    h.stats = fullStats();
    render(<SatisDashboardView />);
    // Başlık 2026-10-08'de değişti (kullanıcı kararı): soru kipi kalktı →
    // "Yeni siparişler bulun"; tek renk (2026-09-17), sayfanın tek h1'i.
    expect(
      screen.getByRole("heading", { level: 1, name: "Yeni siparişler bulun" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("search")).toHaveAttribute("action", "/company/satis");
    expect(screen.queryByRole("navigation", { name: "Talep olan sektörler" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Talep olan sektörler" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Talep açan alıcılar" })).toBeNull();
    expect(screen.queryByText(/Başlangıç/)).toBeNull();
    // Liste anasayfada; "Bugün" bandı kalktı, ürün ekle şeridi duruyor.
    expect(screen.getByTestId("seller-tenders")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Bugün" })).toBeNull();
    expect(screen.getByRole("link", { name: /Ürün ekle/ })).toHaveAttribute("href", "/company/satis/urunlerim?yeni=1");
  });

  it("özet sırası: arama → açık talepler listesi → ürün ekle; sağlık kartları ve keşif kartı YOK", () => {
    h.stats = fullStats();
    const { container } = render(<SatisDashboardView />);
    const html = container.innerHTML;
    const at = (s: string) => html.indexOf(s);
    expect(at("portal-discovery")).toBe(-1);
    expect(at("action-strip")).toBe(-1);
    // Başlık metni HTML'de VAR olmalı: bulunamayan dize -1 döner ve aşağıdaki
    // sıra karşılaştırmasını yanlış sebeple yeşil bırakırdı.
    expect(at("Yeni siparişler bulun")).toBeGreaterThanOrEqual(0);
    expect(at("Yeni siparişler bulun")).toBeLessThan(at("seller-tenders"));
    expect(at("seller-tenders")).toBeLessThan(at("Ürün ekle"));
    // Profil/Ürünler sağlık kartları kaldırıldı (2026-09-09).
    expect(screen.queryByText(/Profili tamamla/)).toBeNull();
    expect(screen.queryByText(/yayında ·/)).toBeNull();
    // TEK arama kutusu (hero); ikinci "İlan aç" YOK.
    expect(screen.getAllByRole("combobox")).toHaveLength(1);
    expect(screen.queryByText(/İlan aç/)).toBeNull();
  });

  it("davet uyarısı TEK yerden gelir: eski banner render edilmez (çift uyarı fix)", () => {
    h.stats = fullStats();
    render(<SatisDashboardView />);
    // Eski InvitedPendingBanner kaldırıldı — davet aksiyonu ActionCenter'da
    // (analytics mock'suz testte satır da yok; çift metin asla oluşmaz).
    expect(
      screen.queryByText(/henüz teklif vermediniz/),
    ).not.toBeInTheDocument();
  });

  it("'Ürün ekle' şeridi yalnız ürün yönetme izniyle (arayüz testi O-099)", () => {
    h.user = { firstName: "Ada", permissions: ["sell:bid:submit"] };
    render(<SatisDashboardView />);
    expect(screen.queryByRole("link", { name: /Ürün ekle/ })).toBeNull();
  });

  it("AI kilidinin nedeni: doğrulanmamış firma → doğrulama bağlantısı; tam yetkili ama koltuk izni yok → yetki notu (arayüz testi O-050)", () => {
    h.company = { name: "Örnek Ltd.", tier: "STANDART" };
    const { unmount } = render(<SatisDashboardView />);
    expect(screen.getByRole("link", { name: "AI ile arama firma doğrulamasıyla açılır" })).toHaveAttribute(
      "href",
      "/company/ayarlar/dogrulama",
    );
    unmount();
    h.company = { name: "Örnek Ltd.", tier: "GOLD" };
    h.user = { firstName: "Ada", permissions: ["company:manage"] };
    render(<SatisDashboardView />);
    expect(screen.getByRole("button", { name: /AI ile ara/ })).toBeDisabled();
    expect(screen.queryByRole("link", { name: "AI ile arama firma doğrulamasıyla açılır" })).toBeNull();
    expect(screen.getByText("AI ile arama, alım ya da satış yetkisi olan kullanıcılara açıktır.")).toBeInTheDocument();
  });

  it("'Firma' kapsamında talep/alıcı önerisi çıkmaz; AI açılınca açık talepler geri gelir (arayüz testi O-095 / D-234)", async () => {
    const user = userEvent.setup();
    h.company = { name: "Örnek Ltd.", tier: "GOLD" };
    render(<SatisDashboardView />);
    // Talep kapsamında öneri var.
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "Alıcı" } });
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Firma" }));
    expect(screen.getByTestId("company-list")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "Alıcı A" } });
    expect(screen.queryByRole("listbox")).toBeNull();
    // AI → kapsam talebe döner, liste açık talepler.
    await user.click(screen.getByRole("button", { name: /AI ile ara/ }));
    expect(screen.queryByTestId("company-list")).toBeNull();
    expect(screen.getByTestId("seller-tenders")).toBeInTheDocument();
  });

  it("öneride maskeli satır (doğrulanmamış firma): alıcı adı yerine 'Alıcı gizli', hedef panel içi maskeli görünüm", () => {
    render(<SatisDashboardView />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "makara" } });
    const opt = screen.getByRole("option", { name: /Kablo makarası alımı/ });
    expect(opt).toHaveAttribute("href", "/company/satis/acik-talep/ROT-000004");
    expect(opt).toHaveTextContent("Alıcı gizli");
  });

  // 2026-10-09 (sahip kararı; arayüz denetimi W-13): gizli sektör (77 = çevre
  // hizmetleri) sektör listesinde yok → adı bulunamayıp HAM KODLA
  // ("77000000 · 1 açık talep") öneriliyor, bağlantısı da listeyi gizli sektöre
  // süzüyordu. "77" yazmak (ör. 77 numaralı talebi aramak) bunu tetikliyordu.
  it("öneride 'Sektörler': gizli sektör ne adıyla ne ham koduyla önerilir; görünür sektör önerilir", () => {
    h.extraTenders = [
      { id: "t77", number: "ROT-000077", title: "Atık bertarafı", status: "OPEN", owner: { id: "c3", name: "Alıcı C" }, ownerCountry: "TR", categories: [{ code: "77101500", name: "Çevre danışmanlığı" }] },
      { id: "t39", number: "ROT-000039", title: "Şalter alımı", status: "OPEN", owner: { id: "c3", name: "Alıcı C" }, ownerCountry: "TR", categories: [{ code: "39121600", name: "Devre kesiciler" }] },
    ];
    render(<SatisDashboardView />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "77" } });
    // Talebin kendisi (numarasıyla) bulunur; gizli sektör önerisi YOK.
    expect(screen.getByRole("option", { name: /Atık bertarafı/ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /77000000/ })).toBeNull();
    expect(document.querySelector('a[href*="kategori=77000000"]')).toBeNull();
    // Görünür sektör adıyla önerilir ve o sektöre süzer.
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "Elektrik" } });
    expect(screen.getByRole("option", { name: /Elektrik/ })).toHaveAttribute("href", "/company/satis?kategori=39000000#acik-talepler");
  });

  // 2026-10-10 (sahip kararı): 46 "İş Güvenliği ve Yangın Ekipmanları" görünür,
  // silah / kolluk dalları gizli. Gizli daldaki talep (46101500) segmente
  // yuvarlanmadan ÖNCE düşer: yuvarlandıktan sonra bakmak onu görünür
  // `46000000` sayar, talep "İş Güvenliği" sektörünün sayacına ve önerisine
  // girerdi (satırı kancadan süzülü gelmeyen çağıran için ikinci kat).
  it("öneride 'Sektörler': görünür sektörün gizli dalındaki talep o sektöre SAYILMAZ; görünür dalındaki sayılır", () => {
    h.extraTenders = [
      { id: "t46", number: "ROT-000046", title: "Kalkan alımı", status: "OPEN", owner: { id: "c3", name: "Alıcı C" }, ownerCountry: "TR", categories: [{ code: "46101500", name: "Ateşli silahlar" }] },
      { id: "t47", number: "ROT-000047", title: "Sprey alımı", status: "OPEN", owner: { id: "c3", name: "Alıcı C" }, ownerCountry: "TR", categories: [{ code: "46182501", name: "Biber gazı" }] },
    ];
    const view = render(<SatisDashboardView />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "46" } });
    expect(screen.getByRole("option", { name: /Kalkan alımı/ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /46000000|İş Güvenliği/ })).toBeNull();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "güvenliği" } });
    expect(screen.queryByRole("option", { name: /İş Güvenliği/ })).toBeNull();
    expect(document.querySelector('a[href*="kategori=46000000"]')).toBeNull();
    view.unmount();

    // Aynı sektörün GÖRÜNÜR dalında (koruyucu giysi) bir talep: sektör adıyla
    // önerilir ve yalnız o talebi sayar (gizli daldaki iki talep sayıya girmez).
    h.extraTenders = [
      ...h.extraTenders,
      { id: "t48", number: "ROT-000048", title: "Eldiven alımı", status: "OPEN", owner: { id: "c3", name: "Alıcı C" }, ownerCountry: "TR", categories: [{ code: "46181500", name: "Koruyucu giysi" }] },
    ];
    render(<SatisDashboardView />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "güvenliği" } });
    const sector = screen.getByRole("option", { name: /İş Güvenliği ve Yangın Ekipmanları/ });
    expect(sector).toHaveAttribute("href", "/company/satis?kategori=46000000#acik-talepler");
    expect(sector).toHaveTextContent("1 açık talep");
  });

  it("AI sonucu: açık taleplere gider, bant kategori çipinde uygulanan SEGMENT'in adını yazar (arayüz testi D-276)", async () => {
    const user = userEvent.setup();
    h.company = { name: "Örnek Ltd.", tier: "GOLD" };
    h.search = "kategori=31000000";
    render(<SatisDashboardView />);
    await user.click(screen.getByRole("button", { name: /AI ile ara/ }));
    fireEvent.change(screen.getByRole("textbox", { name: "AI ile ara" }), { target: { value: "kapı kolu üretiyoruz" } });
    fireEvent.submit(screen.getByRole("search"));
    const r = {
      portal: "satis",
      summary: "kapı kolu",
      query: null,
      category: { id: "31162800", name: "Kollar veya tokmaklar" },
      categoryHint: null,
      city: null,
      cityName: null,
      country: null,
      verifiedOnly: false,
      activity: null,
      priceMax: null,
      currency: null,
      quantity: null,
      unit: null,
      keywords: [],
      relaxed: [],
      relaxedCategoryName: null,
      draft: null,
      downgraded: false,
      warned: false,
    };
    act(() => aiMutate.mock.calls[0][1].onSuccess(r));
    expect(h.push).toHaveBeenLastCalledWith("/company/satis?kategori=31000000#acik-talepler");
    expect(screen.getByRole("button", { name: /Kategori: Bileşen/ })).toBeInTheDocument();
    expect(screen.queryByText(/Kollar veya tokmaklar/)).toBeNull();
  });

  it("'Son Aktiviteler' akışı anasayfada render edilmez (kaldırıldı, 2026-08-03)", () => {
    h.stats = fullStats();
    render(<SatisDashboardView />);
    expect(screen.queryByText("Son Aktiviteler")).not.toBeInTheDocument();
  });

  it("#acik-talepler ile açılınca liste gelince bölüme kaydırır; kayıtlı 'Firma' kapsamı listeyi gizlemez (webC-04 yeniden doğrulama)", () => {
    h.stats = fullStats();
    const scroll = vi.fn();
    const orig = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = scroll;
    sessionStorage.setItem("rothern.hero-scope:satis", "suppliers");
    window.history.replaceState(null, "", "/company/satis#acik-talepler");
    try {
      render(<SatisDashboardView />);
      expect(screen.getByTestId("seller-tenders")).toBeInTheDocument();
      expect(screen.queryByTestId("company-list")).toBeNull();
      expect(scroll).toHaveBeenCalledTimes(1);
      expect(scroll.mock.contexts[0]).toBe(document.getElementById("acik-talepler"));
    } finally {
      Element.prototype.scrollIntoView = orig;
      window.history.replaceState(null, "", "/");
    }
  });

  it("çapasız açılışta kaydırmaz, kayıtlı 'Firma' kapsamı geri gelir", () => {
    h.stats = fullStats();
    const scroll = vi.fn();
    const orig = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = scroll;
    sessionStorage.setItem("rothern.hero-scope:satis", "suppliers");
    try {
      render(<SatisDashboardView />);
      expect(screen.getByTestId("company-list")).toBeInTheDocument();
      expect(scroll).not.toHaveBeenCalled();
    } finally {
      Element.prototype.scrollIntoView = orig;
    }
  });
});
