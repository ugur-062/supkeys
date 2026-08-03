// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  stats: undefined as unknown,
  statsLoading: false,
  activity: [] as unknown[],
  activityTotal: undefined as number | undefined,
  activityCalls: [] as [number, number][],
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
  useSatisActivity: (limit = 8, page = 1) => {
    h.activityCalls.push([limit, page]);
    return {
      data: {
        rows: h.activity,
        total: h.activityTotal ?? h.activity.length,
        page,
        pageSize: limit,
      },
      isPlaceholderData: false,
    };
  },
}));
vi.mock("@/hooks/use-company-orders", () => ({
  useOrders: () => ({ data: [] }),
}));
vi.mock("@/hooks/use-company-messages", () => ({
  useUnreadMessages: () => ({ data: { count: 0 } }),
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
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
  h.activity = [];
  h.activityTotal = undefined;
  h.activityCalls = [];
});

describe("SatisDashboardView", () => {
  it("KPI değerleri + karşılama + performans panelleri görünür", () => {
    h.stats = fullStats();
    render(<SatisDashboardView />);

    expect(screen.getByText("Satış paneli")).toBeInTheDocument();
    expect(screen.getByText("Aktif Davetler")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("Kazanılan İhale")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    // Gelir TRY formatlı.
    expect(screen.getByText(/150\.000/)).toBeInTheDocument();
    // Bağlı müşteri.
    expect(screen.getByText("Bağlı Müşteri")).toBeInTheDocument();
    expect(screen.getByTestId("tcmb")).toBeInTheDocument();
  });

  it("trend rozeti: 8 vs 4 → +100%", () => {
    h.stats = fullStats();
    render(<SatisDashboardView />);
    expect(screen.getByText("+100%")).toBeInTheDocument();
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

  it("aktivite akışı satırları render edilir; boşken boş mesajı", () => {
    h.stats = fullStats();
    h.activity = [
      {
        type: "invitation",
        title: "Çelik Alımı",
        subtitle: "İhale daveti · ROT-2026-0001",
        at: new Date().toISOString(),
        href: "/company/ilan/l1",
      },
    ];
    render(<SatisDashboardView />);
    expect(screen.getByText("Çelik Alımı")).toBeInTheDocument();
    expect(screen.getByText(/İhale daveti · ROT-2026-0001/)).toBeInTheDocument();
  });

  it("aktivite sayfalama: tek sayfada çubuk yok; çok sayfada Sonraki → 2. sayfa istenir", () => {
    h.stats = fullStats();
    h.activity = [
      {
        type: "bid",
        title: "Teklif A",
        subtitle: "Teklif · ROT-2026-0002 · v1",
        at: new Date().toISOString(),
        href: "/company/ilan/l2",
      },
    ];
    // total ≤ pageSize → çubuk görünmez.
    const { unmount } = render(<SatisDashboardView />);
    expect(screen.queryByText(/Sayfa 1/)).not.toBeInTheDocument();
    unmount();

    // total 20 / pageSize 8 → 3 sayfa; Önceki 1. sayfada pasif.
    h.activityTotal = 20;
    render(<SatisDashboardView />);
    expect(screen.getByText("Sayfa 1 / 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Önceki/ })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: /Sonraki/ }));
    expect(screen.getByText("Sayfa 2 / 3")).toBeInTheDocument();
    // Hook 2. sayfayla yeniden çağrılır.
    expect(h.activityCalls.at(-1)).toEqual([8, 2]);
  });

  it("yüklenirken KPI'lar '—' gösterir (sahte '0' yok — denetim §10.1)", () => {
    h.statsLoading = true;
    render(<SatisDashboardView />);
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(4);
  });
});
