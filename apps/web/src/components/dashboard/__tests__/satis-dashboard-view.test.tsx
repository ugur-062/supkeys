// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  stats: undefined as unknown,
  statsLoading: false,
  analytics: undefined as unknown,
  /** URL search param'ları (dönem/karşılaştır/sekme) — test başına ayarlanır. */
  search: "" as string,
}));

vi.mock("@/hooks/use-company-auth", () => ({
  useCompanyAuth: () => ({
    user: { firstName: "Ada" },
    company: { name: "Örnek Ltd." },
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
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
// Hero'daki "AI ile ara" useMutation kullanır — sağlayıcısız test kırılmasın.
vi.mock("@/hooks/use-ai-search-intent", () => ({
  useAiSearchIntent: () => ({ mutate: vi.fn(), isPending: false }),
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
    data: [{ id: "39000000", nameTr: "Elektrik" }, { id: "23000000", nameTr: "Makine" }, { id: "31000000", nameTr: "Bileşen" }],
    isLoading: false,
  }),
}));
vi.mock("@/hooks/use-seller-tenders", () => ({
  useSellerTenders: () => ({
    data: [
      { id: "t1", number: "ROT-000001", title: "Kablo alımı", status: "OPEN", owner: { id: "c1", name: "Alıcı A" }, ownerCity: "Bursa", categories: [] },
      { id: "t2", number: "ROT-000002", title: "Pano alımı", status: "OPEN", owner: { id: "c1", name: "Alıcı A" }, ownerCity: "Bursa", categories: [] },
      { id: "t3", number: "ROT-000003", title: "Eski", status: "AWARDED", owner: { id: "c2", name: "Alıcı B" }, ownerCity: null, categories: [] },
    ],
    isLoading: false,
  }),
}));
vi.mock("@/components/company/seller-tenders-view", () => ({
  SellerTendersView: () => <div data-testid="seller-tenders" />,
}));
// Sağlık kartları profil + katalog uçlarından beslenir; ayrı test edilir.
vi.mock("@/components/dashboard/seller-health-cards", () => ({
  SellerHealthCards: () => <div data-testid="seller-health" />,
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
    // Başlık iki satır (2026-09-08): "Hangi talebe" + portal renginde
    // "teklif vereceksiniz?"; erişilebilir ad ikisini birleştirir.
    expect(
      screen.getByRole("heading", { name: /Hangi talebe/ }),
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

  it("özet sırası: arama → açık talepler listesi → ürün ekle → sağlık; keşif kartı YOK", () => {
    h.stats = fullStats();
    const { container } = render(<SatisDashboardView />);
    const html = container.innerHTML;
    const at = (s: string) => html.indexOf(s);
    expect(at("portal-discovery")).toBe(-1);
    expect(at("action-strip")).toBe(-1);
    expect(at("Hangi talebe teklif")).toBeLessThan(at("seller-tenders"));
    expect(at("seller-tenders")).toBeLessThan(at("Ürün ekle"));
    expect(at("Ürün ekle")).toBeLessThan(at("seller-health"));
    // TEK arama kutusu (hero); ikinci "İlan aç" YOK.
    expect(screen.getAllByRole("searchbox")).toHaveLength(1);
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

  it("'Son Aktiviteler' akışı anasayfada render edilmez (kaldırıldı, 2026-08-03)", () => {
    h.stats = fullStats();
    render(<SatisDashboardView />);
    expect(screen.queryByText("Son Aktiviteler")).not.toBeInTheDocument();
  });
});
