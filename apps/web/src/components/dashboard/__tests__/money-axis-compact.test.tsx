// @vitest-environment jsdom
/**
 * Tutar eksenleri kısaltılır (arayüz testi api1-03 yeniden doğrulama, NEW-2):
 * Şirketim › Gelir Trendi'nde 8 haneli ham değer 56 px'lik eksene sığmayıp
 * soldan kırpılıyordu (12000000 → "2000000"). Satın alma nakit takvimi aynı
 * kalıptaydı.
 */
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SatinalmaAnalytics, SatinalmaDashboard, SatisAnalytics } from "@/hooks/use-company-dashboard";

const h = vi.hoisted(() => ({ yAxes: [] as Array<{ tickFormatter?: (v: number) => string }> }));

vi.mock("recharts", () => {
  const Pass = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  const Nil = () => null;
  return {
    ResponsiveContainer: Pass,
    LineChart: Pass,
    BarChart: Pass,
    ComposedChart: Pass,
    AreaChart: Pass,
    CartesianGrid: Nil,
    XAxis: Nil,
    YAxis: (p: { tickFormatter?: (v: number) => string }) => {
      h.yAxes.push(p);
      return null;
    },
    Line: Nil,
    Bar: Nil,
    Area: Nil,
    Cell: Nil,
    Tooltip: Nil,
  };
});

import { SatinalmaIhaleTab } from "../satinalma-ihale-tab";
import { SatisGelirTab } from "../satis-chart-tabs";

beforeEach(() => {
  h.yAxes = [];
});

describe("tutar ekseni kısaltılmış etiket", () => {
  it("Gelir Trendi: 12.000.000 kısaltılır, 8 haneli ham sayı yazılmaz", () => {
    const analytics = {
      currency: "TRY",
      actions: { unansweredInvites: 0, closingSoonInvites: 0, overdueDeliveries: 0 },
      revenueTrend: [{ key: "2026-09", label: "Eyl", value: 12_000_000, cumulative: 12_000_000 }],
      winLoss: [],
      pipeline: [],
      pareto: { rows: [], totalTry: 0, concentrationWarning: false },
      responseTrend: [],
      categoryWinRate: [],
      missed: { count: 0, amountTry: null },
    } as unknown as SatisAnalytics;
    render(<SatisGelirTab analytics={analytics} loading={false} />);
    const fmt = h.yAxes[0]?.tickFormatter;
    expect(fmt).toBeTypeOf("function");
    const label = fmt!(12_000_000);
    expect(label).not.toMatch(/\d{5,}/);
    expect(label).toMatch(/12/);
    expect(label).toMatch(/₺/);
  });

  it("satın alma nakit takvimi: tutar ekseni kısaltılır", () => {
    const dash: SatinalmaDashboard = {
      openCount: 0, bidsReceived: 0, awarded: 0, ongoingOrders: 0, invitedPending: 0,
      openTendersOwn: [], openTendersCompany: [],
    };
    const sa = {
      currency: "EUR",
      funnel: [
        { key: "listings", label: "Açılan", count: 5 },
        { key: "delivered", label: "Teslim Edildi", count: 3 },
      ],
      cycleTrend: [],
      cashCalendar: [{ label: "H1", amount: 3_500_000 }],
    } as unknown as SatinalmaAnalytics;
    render(<SatinalmaIhaleTab data={dash} analytics={sa} showKpis={false} />);
    const labels = h.yAxes.map((a) => a.tickFormatter?.(3_500_000)).filter(Boolean);
    expect(labels.length).toBeGreaterThan(0);
    for (const l of labels) {
      expect(l).not.toMatch(/\d{5,}/);
      expect(l).toMatch(/€/);
    }
  });
});
