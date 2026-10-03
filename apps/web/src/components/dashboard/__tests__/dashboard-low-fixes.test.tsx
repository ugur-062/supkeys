// @vitest-environment jsdom
/**
 * Pano düşük bulguları (derin denetim LU-29):
 *  - Satış hunisi alt başlığı rapor birimini söyler (eskiden sabit "TL").
 *  - Yanıt süresi tooltip'i katalogdan (eskiden sabit "sa"/"Ortalama").
 *  - Kapanışa kalan gün rozeti takvim günüyle: aynı gün kapanan = "Bugün".
 *  - Özel aralıklı bağlantıyla açılışta tarih paneli kapalı; Escape/Özel kapatır.
 *  - Öneri şeridi arama geçmişi okunmadan `q`siz istek atmaz.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock("recharts", () => {
  const Pass = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  const Nil = () => null;
  return {
    ResponsiveContainer: Pass,
    LineChart: Pass,
    BarChart: Pass,
    ComposedChart: Pass,
    AreaChart: Pass,
    PieChart: Pass,
    CartesianGrid: Nil,
    XAxis: Nil,
    YAxis: Nil,
    Line: Nil,
    Bar: Nil,
    Area: Nil,
    Pie: Nil,
    Cell: Nil,
    Legend: Nil,
    Tooltip: ({ formatter }: { formatter?: (v: unknown) => [string, string] }) => (
      <span data-testid="tooltip">{formatter ? formatter(5).join(" | ") : ""}</span>
    ),
  };
});
vi.mock("@/lib/company-auth/api", () => ({ companyApi: { get: h.get } }));
vi.mock("@/lib/company/recent-searches", () => ({ recentSearches: () => ["pano"] }));
vi.mock("@/components/marketplace/product-card", () => ({
  ProductCard: ({ product }: { product: { name: string } }) => <div>{product.name}</div>,
}));

import { SatisGelirTab, SatisMusteriTab } from "../satis-chart-tabs";
import { DaysLeftBadge } from "../satinalma-ihale-tab";
import { PeriodControls } from "../period-controls";
import { PanelRecommendations } from "../panel-recommendations";
import type { SatisAnalytics } from "@/hooks/use-company-dashboard";

const analytics = {
  currency: "EUR",
  actions: { unansweredInvites: 0, closingSoonInvites: 0, overdueDeliveries: 0 },
  revenueTrend: [],
  winLoss: [],
  pipeline: [{ key: "won", label: "Kazanılan", count: 1, amountTry: 100 }],
  pareto: { rows: [], totalTry: 0, concentrationWarning: false },
  responseTrend: [{ key: "2026-09", label: "Eyl", value: 5 }],
  categoryWinRate: [],
  missed: { count: 0, amountTry: null },
  kpiSeries: { bidsSubmitted: [], won: [], orders: [], revenue: [] },
  deltas: { bidsSubmitted: null, orders: null, revenue: null },
} as unknown as SatisAnalytics;

afterEach(() => {
  vi.useRealTimers();
  h.get.mockReset();
});

describe("Satış grafik sekmeleri — birim ve tooltip katalogdan", () => {
  it("huni alt başlığı rapor birimini yazar, sabit TL değil", () => {
    render(<SatisGelirTab analytics={analytics} loading={false} />);
    expect(screen.getByText(/sonraki aşamalar EUR karşılığı/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/aşamalar TL/);
  });

  it("yanıt süresi tooltip'i katalog anahtarlarından", () => {
    render(<SatisMusteriTab analytics={analytics} loading={false} />);
    const tips = screen.getAllByTestId("tooltip").map((n) => n.textContent);
    expect(tips).toContain("5 sa | Ortalama");
    expect(document.body.textContent).not.toMatch(/satisChartTabs/);
  });
});

describe("DaysLeftBadge — takvim günü", () => {
  it("aynı gün kapanan talep 'Bugün', ertesi gün '1 gün kaldı'", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    // 09:00 İstanbul
    vi.setSystemTime(new Date("2026-10-05T06:00:00Z"));
    const { unmount } = render(<DaysLeftBadge closesAt="2026-10-05T14:00:00Z" />);
    expect(screen.getByText("Bugün")).toBeInTheDocument();
    unmount();
    render(<DaysLeftBadge closesAt="2026-10-06T06:00:00Z" />);
    expect(screen.getByText("1 gün kaldı")).toBeInTheDocument();
  });

  it("kapanış anı geçtiyse 'Kapandı'", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-05T15:00:00Z"));
    render(<DaysLeftBadge closesAt="2026-10-05T14:00:00Z" />);
    expect(screen.getByText("Kapandı")).toBeInTheDocument();
  });
});

describe("PeriodControls — özel aralık paneli", () => {
  const props = { period: "custom" as const, from: "2026-09-01", to: "2026-09-15", onChange: vi.fn() };

  it("özel aralıklı bağlantıyla açılışta panel kapalı, 'Özel' aktif", () => {
    render(<PeriodControls {...props} />);
    expect(screen.queryByText("Uygula")).toBeNull();
    expect(screen.getByRole("button", { name: "Özel" })).toHaveAttribute("aria-pressed", "true");
  });

  it("'Özel' aç/kapa yapar; Escape ve dış tıklama kapatır", () => {
    render(<PeriodControls {...props} />);
    const ozel = screen.getByRole("button", { name: "Özel" });
    fireEvent.click(ozel);
    expect(screen.getByText("Uygula")).toBeInTheDocument();
    fireEvent.click(ozel);
    expect(screen.queryByText("Uygula")).toBeNull();

    fireEvent.click(ozel);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByText("Uygula")).toBeNull();

    fireEvent.click(ozel);
    fireEvent.mouseDown(document.body);
    expect(screen.queryByText("Uygula")).toBeNull();
  });
});

describe("PanelRecommendations — geçmiş okunmadan istek yok", () => {
  it("match kipinde yalnız `q`li istek gider", async () => {
    h.get.mockResolvedValue({ data: { items: [], total: 0, page: 1, pageSize: 16 } });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await act(async () => {
      render(
        <QueryClientProvider client={qc}>
          <PanelRecommendations mode="match" />
        </QueryClientProvider>,
      );
    });
    await waitFor(() => expect(h.get).toHaveBeenCalled());
    const urls = h.get.mock.calls.map((c) => String(c[0]));
    expect(urls.every((u) => u.includes("q=pano"))).toBe(true);
  });
});
