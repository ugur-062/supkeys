// @vitest-environment jsdom
/**
 * Şirketim › Genel Bakış — telefon (360/390 px) yerleşimi (mobil denetim g10,
 * 2026-10-15). jsdom yerleşim hesaplamaz: burada kilitlenen sınıf sözleşmesi
 * ve davranıştır; gerçek genişlik/kaydırma ölçümü tarayıcıda yapılır.
 *  - g10-07: Teklife açık talepler telefonda kart listesi (+ sıralama çipleri),
 *    tablo yalnız sm+; sıralama başlığı ve "Davetli Ekle" dokunma alanı.
 *  - g10-06: tablo kenar payı sarmalayıcının dolgusuna eşit.
 *  - g10-10: En yüksek tasarruflu 5 talep — numara üstte, başlık sarar,
 *    tutar bölünmez; kırılım satırında tutar + yüzde tek satır.
 *  - g10-11: yanıt süresi ekseni arayüz dilinin ayracıyla, 1 saatin altında
 *    dakikaya çevrilir, genişlik en uzun etiketten.
 *  - g10-12: TCMB çipinde kaynak + gün görünür satır.
 *  - g10-14: KPI kartı ipucu telefonda sarar.
 *  - g10-15: aralık rozeti bölünmez, liste oku 44 px dokunma alanı.
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { SatinalmaDashboard, SatisAnalytics } from "@/hooks/use-company-dashboard";

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
    YAxis: Nil,
    Line: Nil,
    Bar: Nil,
    Area: Nil,
    Cell: Nil,
    Tooltip: ({ formatter }: { formatter?: (v: unknown) => [string, string] }) => (
      <span data-testid="tooltip">{formatter ? formatter(5).join(" | ") : ""}</span>
    ),
  };
});

const h = vi.hoisted(() => ({
  rates: { data: undefined as unknown, isLoading: false },
}));
vi.mock("@/hooks/use-exchange-rates", () => ({
  useCurrentExchangeRates: () => h.rates,
}));

import { ChartCard, KpiCard } from "../analytics-primitives";
import { SatinalmaIhaleTab } from "../satinalma-ihale-tab";
import { SatisMusteriTab, responseTimeAxis } from "../satis-chart-tabs";
import { TasarrufTab, type TasarrufTabData } from "../tasarruf-tab";
import { TcmbRatesChip } from "@/components/tcmb-rates-widget";

const cls = (el: Element) => el.className.split(/\s+/);

function dash(rows: SatinalmaDashboard["openTendersOwn"]): SatinalmaDashboard {
  return {
    openCount: rows.length,
    bidsReceived: 0,
    awarded: 0,
    ongoingOrders: 0,
    invitedPending: 0,
    openTendersOwn: rows,
    openTendersCompany: [],
  };
}

const future = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

describe("g10-07 / g10-06 — Teklife açık talepler telefonda kart listesi", () => {
  const rows = [
    { id: "a", tenderNumber: "ROT-000745", title: "RV-B06 L2 rulman ve kayış talebi", openedAt: future(-3), closesAt: future(9), bidCount: 1 },
    { id: "b", tenderNumber: "ROT-000700", title: "Kablo", openedAt: future(-1), closesAt: future(2), bidCount: 3 },
  ];

  it("telefon kartı: numara, saran başlık, kapanış, gelen teklif ve Davetli Ekle; tablo yalnız sm+", () => {
    render(<SatinalmaIhaleTab data={dash(rows)} showKpis={false} />);
    const card = screen.getByText("ROT-000745", { selector: "li span" }).closest("li")!;
    expect(card.closest("div.sm\\:hidden")).not.toBeNull();
    const title = within(card).getByRole("link", { name: "RV-B06 L2 rulman ve kayış talebi" });
    expect(cls(title)).toEqual(expect.arrayContaining(["line-clamp-2", "wrap-break-word"]));
    expect(within(card).getByText("Kapanış")).toBeInTheDocument();
    expect(within(card).getByText("Gelen Teklif")).toBeInTheDocument();
    const invite = within(card).getByRole("link", { name: "Davetli Ekle" });
    expect(invite).toHaveAttribute("href", "/company/ilan/a");
    expect(cls(invite)).toEqual(expect.arrayContaining(["relative", "after:absolute", "after:-inset-y-3.5"]));
    // Tablo telefonda gizli; kenar payı sarmalayıcının dolgusuna eşit (taşmaz).
    const table = screen.getByRole("table");
    const wrap = table.closest("div.px-3")!;
    expect(cls(wrap)).toEqual(expect.arrayContaining(["hidden", "sm:block", "[--gutter:--spacing(3)]"]));
    expect(wrap.className).not.toContain("--spacing(5)");
  });

  it("sıralama çipleri tablo başlığıyla aynı durumu sürer (ikinci dokunuş yönü çevirir)", () => {
    render(<SatinalmaIhaleTab data={dash(rows)} showKpis={false} />);
    const group = screen.getByRole("group", { name: "Sırala:" });
    const closes = within(group).getByRole("button", { name: /Kapanış/ });
    // Varsayılan: kapanışa göre artan → en yakın kapanan (ROT-000700) önce.
    expect(closes).toHaveAttribute("aria-pressed", "true");
    expect(closes).toHaveTextContent("artan");
    const numbers = () =>
      Array.from(document.querySelectorAll("div.sm\\:hidden li")).map((li) => li.querySelector("span")!.textContent);
    expect(numbers()).toEqual(["ROT-000700", "ROT-000745"]);
    fireEvent.click(closes);
    expect(closes).toHaveTextContent("azalan");
    expect(numbers()).toEqual(["ROT-000745", "ROT-000700"]);
    // Tablo başlığı da aynı durumu gösterir.
    expect(screen.getByRole("columnheader", { name: /Kapanış/ })).toHaveAttribute("aria-sort", "descending");
    const bids = within(group).getByRole("button", { name: /Gelen Teklif/ });
    fireEvent.click(bids);
    expect(bids).toHaveAttribute("aria-pressed", "true");
    expect(closes).toHaveAttribute("aria-pressed", "false");
    expect(numbers()).toEqual(["ROT-000745", "ROT-000700"]);
    // 32 px çip, görünmez katmanla 44 px dokunma alanı.
    expect(cls(bids)).toEqual(expect.arrayContaining(["h-8", "relative", "after:-inset-y-1.5"]));
  });

  it("tablo sıralama başlığının dokunma alanı görünmez katmanla büyür", () => {
    render(<SatinalmaIhaleTab data={dash(rows)} showKpis={false} />);
    const header = screen.getByRole("columnheader", { name: /Açılış Tarihi/ });
    const btn = within(header).getByRole("button");
    expect(cls(btn)).toEqual(expect.arrayContaining(["relative", "after:absolute", "after:-inset-y-3"]));
  });
});

describe("g10-10 — Tasarruf sekmesi telefon satırları", () => {
  const m = { totalSavings: 0, totalVolume: 0, averageSavingsRate: 0 };
  const data: TasarrufTabData = {
    currency: "TRY",
    month: m,
    year: m,
    topSavingsMonth: [],
    topSavingsYear: [{ rank: 1, tenderNumber: "ROT-000745", title: "RV-B06 L2 rulman ve kayış talebi", amount: 320 }],
    categoryMonth: [],
    categoryYear: [{ label: "Üretim Bileşenleri ve Endüstriyel Ekipman", percent: 0.01, amount: 320 }],
    currencyMonth: [],
    currencyYear: [],
  };

  it("numara başlığın üstünde, başlık telefonda sarar; tutar bölünmez", () => {
    render(<TasarrufTab data={data} period="year" />);
    const title = screen.getByText("RV-B06 L2 rulman ve kayış talebi");
    expect(cls(title)).toEqual(expect.arrayContaining(["block", "wrap-break-word", "sm:truncate"]));
    expect(cls(title)).not.toContain("truncate");
    const li = title.closest("li")!;
    const amount = within(li).getByText("320,00 ₺");
    expect(cls(amount)).toEqual(expect.arrayContaining(["shrink-0", "whitespace-nowrap"]));
  });

  it("kırılım satırında tutar + yüzde tek satır; uzun kategori adı telefonda sarar", () => {
    render(<TasarrufTab data={data} period="year" />);
    const label = screen.getByText("Üretim Bileşenleri ve Endüstriyel Ekipman");
    expect(cls(label)).toEqual(expect.arrayContaining(["min-w-0", "sm:truncate"]));
    const value = label.nextElementSibling!;
    expect(cls(value)).toEqual(expect.arrayContaining(["shrink-0", "whitespace-nowrap"]));
  });
});

describe("g10-11 — teklif yanıt süresi ekseni", () => {
  it("1 saatin altında dakikaya çevrilir; sayılar arayüz dilinin ayracıyla; genişlik etiketten", () => {
    const min = responseTimeAxis([{ value: 0.025 }, { value: 0.075 }, { value: null }], "tr");
    expect(min.minutes).toBe(true);
    expect(min.scale).toBe(60);
    expect(min.tick(5)).toBe("5");
    expect(min.tip(4.5)).toBe("4,5");
    expect(min.width).toBeGreaterThanOrEqual(34);

    const hours = responseTimeAxis([{ value: 0.5 }, { value: 1.2 }], "tr");
    expect(hours.minutes).toBe(false);
    expect(hours.tick(0.75)).toBe("0,75");
    expect(responseTimeAxis([{ value: 1.2 }], "en").tick(0.75)).toBe("0.75");
    // "0,25" gibi 4 karakterlik etiket sabit 34 px'e sığmıyordu ("0.075" → ".075").
    expect(hours.width).toBeGreaterThan(34);
    expect(responseTimeAxis([{ value: 1234 }], "tr").width).toBeGreaterThan(hours.width);
  });

  const analytics = {
    currency: "TRY",
    actions: { unansweredInvites: 0, closingSoonInvites: 0, overdueDeliveries: 0 },
    revenueTrend: [],
    winLoss: [],
    pipeline: [],
    pareto: { rows: [], totalTry: 0, concentrationWarning: false },
    responseTrend: [
      { key: "2026-09", label: "Eyl", value: 0.075 },
      { key: "2026-10", label: "Eki", value: 0.025 },
    ],
    categoryWinRate: [],
    missed: { count: 0, amountTry: null },
    kpiSeries: { bidsSubmitted: [], won: [], orders: [], revenue: [] },
    deltas: { bidsSubmitted: null, orders: null, revenue: null },
  } as unknown as SatisAnalytics;

  it("dakika ekseninde ipucu 'dk', birim satırı 'dakika'; alt başlık birim söylemez", () => {
    render(<SatisMusteriTab analytics={analytics} loading={false} />);
    expect(screen.getAllByTestId("tooltip").map((n) => n.textContent)).toContain("5 dk | Ortalama");
    expect(screen.getByText("dakika")).toBeInTheDocument();
    expect(screen.getByText("Davetten teklife geçen ortalama süre (aylık)")).toBeInTheDocument();
  });

  it("saat ekseninde birim satırı 'saat'", () => {
    render(
      <SatisMusteriTab
        analytics={{ ...analytics, responseTrend: [{ key: "2026-10", label: "Eki", value: 5 }] } as SatisAnalytics}
        loading={false}
      />,
    );
    expect(screen.getAllByTestId("tooltip").map((n) => n.textContent)).toContain("5 sa | Ortalama");
    expect(screen.getByText("saat")).toBeInTheDocument();
  });
});

describe("g10-12 — TCMB kur çipi", () => {
  it("kaynak ve kur günü dokunmatikte / dar ekranda görünür satır; masaüstünde title", () => {
    h.rates = {
      data: { rateDate: "2026-10-14", rates: { USD: 49.39, EUR: 55.3, GBP: 65.63 } },
      isLoading: false,
    };
    render(<TcmbRatesChip />);
    const source = screen.getByTestId("tcmb-rates-source");
    expect(source.textContent).toMatch(/^TCMB günlük gösterge kuru · 14 Ekim 2026$/);
    expect(cls(source)).toEqual(expect.arrayContaining(["hidden", "max-sm:block", "pointer-coarse:block"]));
    const chip = screen.getByRole("group");
    expect(chip).toHaveAttribute("title", source.textContent!);
  });
});

describe("g10-14 / g10-15 — kart başlıkları ve ipuçları", () => {
  it("KPI ipucu telefonda sarar (sm+ tek satır); kart telefonda p-4", () => {
    render(<KpiCard label="Kazandığım İşler" value={3} hint="Kısmi kazanım dahil" />);
    const hint = screen.getByText("Kısmi kazanım dahil");
    expect(cls(hint)).toContain("sm:truncate");
    expect(cls(hint)).not.toContain("truncate");
    const card = hint.closest("div.rounded-xl")!;
    expect(cls(card)).toEqual(expect.arrayContaining(["p-4", "sm:p-5"]));
    expect(cls(card)).not.toContain("p-5");
    // Değer telefonda bir boy küçük ve sığmazsa sarar (kart kırpmasın).
    const value = screen.getByText("3");
    expect(cls(value)).toEqual(expect.arrayContaining(["text-2xl", "sm:text-3xl", "max-sm:whitespace-normal"]));
  });

  it("KPI başlık satırı telefonda sarar: değişim rozeti sığmazsa alt satıra iner (kırpılmaz), sm+ tek satır", () => {
    render(<KpiCard label="Aktif Tekliflerim" value={4} deltaPct={100} />);
    const row = screen.getByText("Aktif Tekliflerim").parentElement!;
    expect(cls(row)).toEqual(expect.arrayContaining(["flex", "max-sm:flex-wrap", "gap-x-2", "gap-y-1"]));
    expect(cls(row)).not.toContain("flex-wrap");
  });

  it("aralık rozeti bölünmez, başlık sarar; liste okunun dokunma alanı 44 px", () => {
    render(
      <ChartCard title="Kazanma / Kaybetme Dağılımı" ariaLabel="x" rangeBadge="son 12 ay" href="/company/satis/tekliflerim">
        <div />
      </ChartCard>,
    );
    const badge = screen.getByText("son 12 ay");
    expect(cls(badge)).toEqual(expect.arrayContaining(["shrink-0", "whitespace-nowrap"]));
    expect(cls(badge.parentElement!)).toContain("flex-wrap");
    const arrow = screen.getByRole("link");
    expect(cls(arrow)).toEqual(expect.arrayContaining(["relative", "after:absolute", "after:-inset-2.5", "p-1"]));
  });
});
