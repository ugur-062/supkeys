// @vitest-environment jsdom
/**
 * Döngü süresi grafiği — birim etiketi ve tooltip katalogdan (derin denetim
 * 2026-09-29 X06/S073). Eskiden birim `t("gun")` ile DEĞERSİZ çağrılıyordu
 * (katalog "{n} gün" → prod'da ham ICU metni, dev'de anahtar yolu), saat
 * dalında birim ve tooltip başlığı sabit Türkçe ("saat" / "Ortalama") idi.
 */
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("recharts", () => {
  const Pass = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  const Nil = () => null;
  return {
    ResponsiveContainer: Pass,
    LineChart: Pass,
    BarChart: Pass,
    PieChart: Pass,
    AreaChart: Pass,
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
      <span data-testid="tooltip">{formatter ? formatter(12).join(" | ") : ""}</span>
    ),
  };
});

import { CycleTrendChart } from "../satinalma-ihale-tab";

const pts = (values: number[]) =>
  values.map((value, i) => ({ key: `2026-0${i + 1}`, label: `A${i + 1}`, value }));

describe("CycleTrendChart — birim ve tooltip katalogdan", () => {
  it("gün ekseni: birim parametresiz anahtardan, tooltip çoğul biçimli değerle", () => {
    render(<CycleTrendChart points={pts([3, 5, 12])} />);
    expect(screen.getByText("gün")).toBeInTheDocument();
    expect(screen.getByTestId("tooltip").textContent).toBe("12 gün | Ortalama");
    expect(document.body.textContent).not.toMatch(/\{n\}|satinalmaIhaleTab/);
  });

  it("saat ekseni (tüm değerler < 1 gün): birim ve tooltip katalogdan", () => {
    render(<CycleTrendChart points={pts([0.2, 0.4, 0.5])} />);
    expect(screen.getByText("saat")).toBeInTheDocument();
    expect(screen.getByTestId("tooltip").textContent).toBe("12 saat | Ortalama");
    expect(document.body.textContent).not.toMatch(/\{n\}|satinalmaIhaleTab/);
  });

  it("3 noktadan az + ortalama 1 saatin altında: '<1 saat' yazar, '0 saat' değil (webC-04 yeniden doğrulama)", () => {
    // ~5 dk ve ~10 dk → ortalama ~7,5 dk = 0,005 gün.
    render(<CycleTrendChart points={pts([0.0035, 0.007])} />);
    expect(screen.getByText("<1 saat")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/\b0 saat/);
  });

  it("3 noktadan az + 1 saatin üstü: saat sayısı yuvarlanarak yazılır", () => {
    render(<CycleTrendChart points={pts([0.25, 0.25])} />);
    expect(screen.getByText("6 saat")).toBeInTheDocument();
  });
});
