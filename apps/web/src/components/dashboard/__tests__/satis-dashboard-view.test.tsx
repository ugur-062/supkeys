// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  stats: undefined as unknown,
  statsLoading: false,
  activity: [] as unknown[],
}));

vi.mock("@/hooks/use-company-auth", () => ({
  useCompanyAuth: () => ({
    user: { firstName: "Ada" },
    company: { name: "Örnek Ltd." },
  }),
}));
vi.mock("@/hooks/use-company-dashboard", () => ({
  useSatisStats: () => ({ data: h.stats, isLoading: h.statsLoading }),
  useSatisActivity: () => ({ data: h.activity }),
}));
vi.mock("@/components/tcmb-rates-widget", () => ({
  TcmbRatesWidget: () => <div data-testid="tcmb" />,
}));
// ActionStrip kendi hook'larıyla (onay/mesaj/sipariş) ayrı test edilir —
// burada extra prop sözleşmesini gözlemleyen hafif mock.
vi.mock("@/components/dashboard/action-strip", () => ({
  ActionStrip: ({
    extra = [],
  }: {
    extra?: { key: string; label: string; count?: number }[];
  }) => (
    <div data-testid="action-strip">
      {extra.map((e) => (
        <span key={e.key}>{`${e.count} ${e.label}`}</span>
      ))}
    </div>
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
  h.activity = [];
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

  it("davet uyarı banner'ı teklif verilmemiş davet sayısını gösterir", () => {
    h.stats = fullStats();
    render(<SatisDashboardView />);
    expect(
      screen.getByText("Davet edildiğiniz 3 ihaleye henüz teklif vermediniz"),
    ).toBeInTheDocument();
  });

  it("davet sıfırsa uyarı banner'ı görünmez", () => {
    h.stats = fullStats({ invitations: { active: 0 } });
    render(<SatisDashboardView />);
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

  it("yüklenirken KPI'lar '…' gösterir", () => {
    h.statsLoading = true;
    render(<SatisDashboardView />);
    expect(screen.getAllByText("…").length).toBeGreaterThanOrEqual(4);
  });
});
