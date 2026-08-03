// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  stats: undefined as unknown,
  statsLoading: false,
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
  useSatisAnalytics: () => ({ data: undefined, isLoading: false }),
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
// ActionCenter kendi ucundan beslenir (action-center endpoint) — ayrı test
// edilir; burada varlığını gözlemleyen hafif mock.
vi.mock("@/components/dashboard/action-center", () => ({
  ActionCenter: () => <div data-testid="action-center" />,
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
  h.search = "";
});

describe("SatisDashboardView", () => {
  it("KPI değerleri + karşılama + tutar KPI satırı görünür", () => {
    h.stats = fullStats();
    render(<SatisDashboardView />);

    expect(screen.getByText("Satış paneli")).toBeInTheDocument();
    expect(screen.getByText("Aktif Davetler")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("Kazanılan İhale")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    // Faz 7.4: "Performans" kartı yerine tutar KPI satırı — gelir kompakt
    // ("150 B ₺"), tam değer title'da.
    expect(screen.getByText("Toplam Gelir")).toBeInTheDocument();
    expect(screen.getByText(/150\sB\s₺/)).toBeInTheDocument();
    expect(screen.getByText("Bağlı Müşteri")).toBeInTheDocument();
    expect(screen.getByTestId("tcmb")).toBeInTheDocument();
  });

  it("delta rozeti her zaman çizilir (karşılaştır toggle'ı kaldırıldı): 8 vs 4 → %100", () => {
    h.stats = fullStats();
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
    expect(screen.queryByText("Aktif Davetler")).not.toBeInTheDocument();
    expect(screen.queryByText("—")).not.toBeInTheDocument();
    expect(document.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });
});
