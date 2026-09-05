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
vi.mock("@/components/tcmb-rates-widget", () => ({
  TcmbRatesChip: () => <div data-testid="tcmb" />,
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
  useDiscoverFacets: () => ({
    data: { segments: [{ id: "39000000", name: "Elektrik", count: 4 }, { id: "23000000", name: "Makine", count: 0 }], total: 4 },
    isLoading: false,
  }),
  useCategorySegments: () => ({
    data: [{ id: "39000000", nameTr: "Elektrik" }, { id: "23000000", nameTr: "Makine" }, { id: "31000000", nameTr: "Bileşen" }],
    isLoading: false,
  }),
}));
vi.mock("@/hooks/use-seller-tenders", () => ({
  useSellerTenders: () => ({
    data: [
      { id: "t1", number: "ROT-000001", title: "Kablo alımı", status: "OPEN", masked: false, owner: { id: "c1", name: "Alıcı A" }, ownerCity: "Bursa", categories: [] },
      { id: "t2", number: "ROT-000002", title: "Pano alımı", status: "OPEN", masked: false, owner: { id: "c1", name: "Alıcı A" }, ownerCity: "Bursa", categories: [] },
      { id: "t3", number: "ROT-000003", title: "Eski", status: "AWARDED", masked: false, owner: { id: "c2", name: "Alıcı B" }, ownerCity: null, categories: [] },
    ],
    isLoading: false,
  }),
}));
vi.mock("@/components/dashboard/matched-requests-widget", () => ({
  MatchedRequestsWidget: () => <div data-testid="matched-requests" />,
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
  it("KPI değerleri + karşılama + tutar KPI satırı görünür", () => {
    h.stats = fullStats();
    // C9: davet kartı artık analytics.unansweredInvites'tan beslenir.
    h.analytics = {
      actions: { unansweredInvites: 3 },
      deltas: {},
      kpiSeries: {},
    };
    render(<SatisDashboardView />);

    expect(screen.getByText("Satış paneli")).toBeInTheDocument();
    expect(screen.getByText("Yanıt Bekleyen Davet")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    // Seçici (kpi-selectors): 2 aktif teklif (açık talep; AWARDED'daki
    // sayılmaz), 2 kazanım (kısmi dahil),
    // 1 aktif satış siparişi (DELIVERED canlı, COMPLETED değil, alıcı rolü hariç).
    expect(screen.getByText("Aktif Tekliflerim").closest("a")).toHaveTextContent("2");
    expect(screen.getByText("Kazandığım İşler").closest("a")).toHaveTextContent("2");
    expect(screen.getByText("Aktif Sipariş").closest("a")).toHaveTextContent("1");
    expect(screen.queryByText("Bekleyen Sipariş")).toBeNull();
    expect(screen.getByTestId("tcmb")).toBeInTheDocument();
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

  it("arama kutusu ilk ekranda: açık talepleri arar, çipler sektörlere gider (2026-09-05)", () => {
    h.stats = fullStats();
    render(<SatisDashboardView />);
    expect(screen.getByRole("heading", { name: "Hangi talebe teklif vereceksiniz?" })).toBeInTheDocument();
    const form = screen.getByRole("search");
    expect(form).toHaveAttribute("action", "/company/satis/acik-talepler");
    const cips = within(screen.getByRole("navigation", { name: "Talep olan sektörler" }));
    expect(cips.getByRole("link", { name: /Elektrik/ })).toHaveAttribute("href", "/company/satis/acik-talepler?kategori=39000000");
    // Sayısı 0 olan sektör ÇİP olmaz (vitrin kartı olabilir).
    expect(cips.queryByRole("link", { name: /Makine/ })).toBeNull();
  });

  it("sektör kartları fotoğraflı ve hedefli; alıcı bloğu yalnız AÇIK talebi olan sahipleri sayar", () => {
    h.stats = fullStats();
    render(<SatisDashboardView />);
    // 8 segmentten dolu olan önde (Elektrik 4), sayısı 0 olan da kart olur ("Keşfet").
    const sektor = screen.getByRole("region", { name: "Talep olan sektörler" });
    expect(sektor.querySelector("a[href='/company/satis/acik-talepler?kategori=39000000']")).not.toBeNull();
    expect(sektor.querySelector("img")?.getAttribute("src")).toContain("categories");
    // Alıcı A iki açık talep; Alıcı B'nin talebi AWARDED → listede yok.
    const alici = screen.getByRole("region", { name: "Talep açan alıcılar" });
    expect(alici).toHaveTextContent("Alıcı A");
    expect(alici).toHaveTextContent("2 açık talep");
    expect(alici).not.toHaveTextContent("Alıcı B");
    expect(within(alici).getByRole("link", { name: /Alıcı A/ })).toHaveAttribute("href", "/company/satis/acik-talepler?q=Al%C4%B1c%C4%B1%20A");
    // Başlangıç listesi KALDIRILDI; "Bugün" bandı ve ürün ekle şeridi var.
    expect(screen.queryByText(/Başlangıç/)).toBeNull();
    expect(screen.getByRole("heading", { name: "Bugün" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Ürün ekle/ })).toHaveAttribute("href", "/company/satis/urunlerim?yeni=1");
  });

  it("özet sırası: arama → sektörler → size uygun talepler → alıcılar → şerit → KPI → sağlık; keşif kartı YOK", () => {
    h.stats = fullStats();
    const { container } = render(<SatisDashboardView />);
    const html = container.innerHTML;
    const at = (s: string) => html.indexOf(s);
    expect(at("portal-discovery")).toBe(-1);
    expect(at("action-strip")).toBeGreaterThan(-1);
    expect(at("Hangi talebe teklif")).toBeLessThan(at("Talep olan sektörler"));
    expect(at("Talep olan sektörler")).toBeLessThan(at("matched-requests"));
    expect(at("matched-requests")).toBeLessThan(at("Talep açan alıcılar"));
    expect(at("Talep açan alıcılar")).toBeLessThan(at("action-strip"));
    expect(at("action-strip")).toBeLessThan(at("Aktif Tekliflerim"));
    expect(at("Aktif Tekliflerim")).toBeLessThan(at("seller-health"));
    // TEK arama kutusu (hero); ikinci "İlan aç" YOK.
    expect(screen.getAllByRole("searchbox")).toHaveLength(1);
    expect(screen.queryByText(/İlan aç/)).toBeNull();
  });

  it("delta rozeti KPI kartında çizilir (analitikten gelir)", () => {
    // Tutar kartlarındaki 30-günlük delta Raporlar'a taşındı; panodaki
    // kartların deltası analytics.deltas'tan gelmeye devam ediyor.
    h.stats = fullStats();
    h.analytics = {
      actions: { unansweredInvites: 0 },
      deltas: { bidsSubmitted: 100 },
      kpiSeries: {},
    };
    render(<SatisDashboardView />);
    // TrendBadge biçimi: ok ikonu + "%100" (TR yüzde önde).
    expect(screen.getAllByText(/%100/).length).toBeGreaterThanOrEqual(1);
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

  it("yüklenirken kartlar yerine iskelet çizilir (sahte '0'/'—' karışımı yok — Faz 7.3)", () => {
    h.statsLoading = true;
    render(<SatisDashboardView />);
    // KPI kartları render edilmez; gerçek boyutlu iskelet var.
    expect(screen.queryByText("Yanıt Bekleyen Davet")).not.toBeInTheDocument();
    expect(screen.queryByText("—")).not.toBeInTheDocument();
    expect(document.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });
});
