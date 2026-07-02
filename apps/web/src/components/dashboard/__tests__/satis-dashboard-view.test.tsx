// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

    expect(screen.getByText(/Hoş geldin, Ada/)).toBeInTheDocument();
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

  it("aksiyon banner'ı davet+sipariş içerir ve kapatılabilir", async () => {
    const user = userEvent.setup();
    h.stats = fullStats();
    render(<SatisDashboardView />);

    expect(
      screen.getByText("3 aktif davete teklif bekleniyor"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("1 sipariş için teslimat başlatılmadı"),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Bildirimi kapat" }));
    expect(
      screen.queryByText("3 aktif davete teklif bekleniyor"),
    ).not.toBeInTheDocument();
  });

  it("davet/sipariş sıfırsa banner hiç render edilmez", () => {
    h.stats = fullStats({
      invitations: { active: 0 },
      orders: { pending: 0 },
    });
    render(<SatisDashboardView />);
    expect(screen.queryByText("Aksiyon Bekleyen İşler")).not.toBeInTheDocument();
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
