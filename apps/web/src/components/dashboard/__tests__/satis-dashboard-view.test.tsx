// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
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
vi.mock("@/hooks/use-company-orders", () => ({
  useOrders: () => ({ data: [] }),
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
    // Sözlük düzeltmesi (2026-09-03): satış panelinde "Satın Alma Talebi"
    // KAZANILMAZ — kazanılan şey teklif/iştir.
    expect(screen.getByText("Kazandığım İşler")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByTestId("tcmb")).toBeInTheDocument();
  });

  it("GRAFİKLER ve dönemsel tutar kartları panoda YOK — Raporlar'a taşındı", () => {
    // Anasayfa artık pazar yeriyle açılıyor; dönemsel okuma Raporlar'da.
    h.stats = fullStats();
    render(<SatisDashboardView />);
    expect(screen.queryByText("Toplam Gelir")).not.toBeInTheDocument();
    expect(screen.queryByText("Bağlı Müşteri")).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Gelir" })).toBeNull();
    // Yönlendirme kalmalı: veri kaybolmadı, yer değiştirdi.
    expect(screen.getByRole("link", { name: /Raporlar/ })).toBeInTheDocument();
  });

  it("özet sırası: şerit → KPI → size uygun talepler → sağlık → Raporlar; keşif kartı YOK", () => {
    h.stats = fullStats();
    const { container } = render(<SatisDashboardView />);
    const html = container.innerHTML;
    const at = (s: string) => html.indexOf(s);
    expect(at("portal-discovery")).toBe(-1);
    expect(at("action-strip")).toBeGreaterThan(-1);
    expect(at("action-strip")).toBeLessThan(at("Aktif Tekliflerim"));
    expect(at("Aktif Tekliflerim")).toBeLessThan(at("matched-requests"));
    expect(at("matched-requests")).toBeLessThan(at("seller-health"));
    expect(at("seller-health")).toBeLessThan(at("Raporlar"));
    // Anasayfada arama kutusu ve ikinci "İlan aç" YOK (1a/1b).
    expect(screen.queryByRole("searchbox")).toBeNull();
    expect(screen.queryByText(/İlan aç/)).toBeNull();
    // Alt not artık bağlantı.
    expect(screen.getByRole("link", { name: /Raporlar/ })).toHaveAttribute(
      "href",
      "/company/satis/raporlar",
    );
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
