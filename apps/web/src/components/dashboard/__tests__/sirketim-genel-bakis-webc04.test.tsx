// @vitest-environment jsdom
/**
 * Şirketim › Genel Bakış, İş Analizi, Ziyaret Edenler — arayüz testi webC-04.
 *  - O-032/O-035: KPI ve bekleyen iş bağlantıları süzülmüş listeye gider.
 *  - O-041: Satış hunisinde Kazanıldı oranı Teklif Verildi'ye göre; <1 saat "<1 sa".
 *  - O-042: 90 çubuk görünüm alanına sığar.
 *  - O-102: analitik hatasında boş durum değil tekrar-dene'li hata.
 *  - O-104: Tedarikçi sekmesi sayfa dönemini izler; çeyrekte yıl notu.
 *  - O-106: satış sekmesinde eski rota yok.
 *  - D-292: bağlantısız KPI kartı.  D-296: tekrar dene.  D-297: 0,00'lık sıralama yok.
 *  - D-298: şehir adları okuyucunun dilinde (useCityLabel).
 */
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InsightsResponse, VisitorsResponse } from "@/hooks/use-company-views";
import type {
  SatinalmaAnalytics,
  SatinalmaDashboard,
  SatisAnalytics,
} from "@/hooks/use-company-dashboard";

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
    Tooltip: Nil,
  };
});

const h = vi.hoisted(() => ({
  insights: { data: undefined as unknown, isLoading: false, isError: false, refetch: vi.fn() },
  visitors: { data: undefined as unknown, isLoading: false, isError: false, refetch: vi.fn() },
}));
vi.mock("@/hooks/use-company-views", () => ({
  useInsights: () => h.insights,
  useVisitors: () => h.visitors,
}));
vi.mock("@/hooks/use-company-profile", () => ({
  useCompanyProfile: () => ({ data: { visitsVisible: true }, isLoading: false }),
  useUpdateCompanyProfile: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
// Test ortamı TR'de sabit; şehir etiketinin `useCityLabel`den geçtiği görülsün.
vi.mock("@/i18n/domain", async (orig) => ({
  ...(await orig<typeof import("@/i18n/domain")>()),
  useCityLabel: () => (c: string | null | undefined) => (c ? `city:${c}` : ""),
}));

import { MiniBars } from "@/components/company/ui/mini-bars";
import { InsightsView } from "@/components/company/insights-view";
import { VisitorsView } from "@/components/company/visitors-view";
import { ACTION_ROWS, BUYER_ORDER_HREF, BUYER_TENDER_HREF, SELLER_ORDER_HREF } from "@/lib/dashboard/strings";
import { FunnelChart, KpiCard } from "../analytics-primitives";
import { SatinalmaIhaleTab } from "../satinalma-ihale-tab";
import { SatisGelirTab, SatisMusteriTab } from "../satis-chart-tabs";
import { TasarrufTab, type TasarrufTabData } from "../tasarruf-tab";
import { TedarikciTab, type TedarikciTabData } from "../tedarikci-tab";

beforeEach(() => {
  h.insights = { data: undefined, isLoading: false, isError: false, refetch: vi.fn() };
  h.visitors = { data: undefined, isLoading: false, isError: false, refetch: vi.fn() };
});

describe("bağlantılar süzülmüş listeye (O-032, O-035)", () => {
  it("KPI hedefleri: 'Gelen Teklifler' ≠ 'Açık Taleplerim'; satış 'Aktif Sipariş' süzülmüş liste", () => {
    expect(BUYER_TENDER_HREF.open).toBe("/company/satinalma/taleplerim?status=OPEN");
    expect(BUYER_TENDER_HREF.bidsReceived).toBe("/company/satinalma/taleplerim?status=OPEN&bids=1");
    expect(BUYER_TENDER_HREF.bidsReceived).not.toBe(BUYER_TENDER_HREF.open);
    expect(SELLER_ORDER_HREF.active).toBe("/company/satis/siparisler?status=PENDING,ACCEPTED,IN_DELIVERY,DELIVERED");
  });

  it("teslim edilmiş = DELIVERED + COMPLETED; devam eden = sayımın durumları", () => {
    expect(BUYER_ORDER_HREF.delivered).toBe("/company/satinalma/siparisler?status=DELIVERED,COMPLETED");
    expect(BUYER_ORDER_HREF.ongoing).toBe("/company/satinalma/siparisler?status=PENDING,ACCEPTED,IN_DELIVERY,DELIVERED");
  });

  it("bekleyen iş satırlarının sipariş/talep hedefleri durum süzgeci taşır", () => {
    for (const portal of ["satinalma", "satis"] as const) {
      for (const [key, row] of Object.entries(ACTION_ROWS[portal])) {
        if (/\/(siparisler|taleplerim)$/.test(row.href)) throw new Error(`${portal}.${key} süzgeçsiz: ${row.href}`);
      }
    }
    // Türetilmiş kümeler kendi parametresiyle (yeniden doğrulama): üst küme değil.
    expect(ACTION_ROWS.satinalma.overdueDeliveries!.href).toBe("/company/satinalma/siparisler?due=overdue");
    expect(ACTION_ROWS.satis.overdueDeliveries!.href).toBe("/company/satis/siparisler?due=overdue");
    expect(ACTION_ROWS.satinalma.closingSoon!.href).toBe("/company/satinalma/taleplerim?closing=soon");
    expect(ACTION_ROWS.satinalma.zeroBidClosingSoon!.href).toBe("/company/satinalma/taleplerim?closing=nobids");
    expect(ACTION_ROWS.satinalma.sellerApproval!.href).toBe("/company/satinalma/siparisler?status=PENDING");
    // Son tur: ödeme ve AI satırları da türetilmiş küme — geniş durum listesi değil.
    expect(ACTION_ROWS.satinalma.overduePayments!.href).toBe("/company/satinalma/siparisler?payment=overdue");
    expect(ACTION_ROWS.satinalma.paymentWindow!.href).toBe("/company/satinalma/siparisler?payment=open");
    expect(ACTION_ROWS.satinalma.aiSuggestions!.href).toBe("/company/satinalma/taleplerim?status=OPEN&ai=1");
    expect(ACTION_ROWS.satis.expiringBids!.href).toBe("/company/satis/tekliflerim?pending=1");
  });

  const dash: SatinalmaDashboard = {
    openCount: 0, bidsReceived: 0, awarded: 0, ongoingOrders: 0, invitedPending: 0,
    openTendersOwn: [], openTendersCompany: [],
  };
  const saAnalytics = {
    currency: "TRY",
    funnel: [
      { key: "listings", label: "Açılan", count: 5 },
      { key: "delivered", label: "Teslim Edildi", count: 3 },
    ],
    cycleTrend: [],
    cashCalendar: [{ label: "H1", amount: 10 }],
  } as unknown as SatinalmaAnalytics;

  it("huni 'Teslim Edildi' ve nakit takvimi DELIVERED,COMPLETED listesine gider", () => {
    render(<SatinalmaIhaleTab data={dash} analytics={saAnalytics} showKpis={false} />);
    expect(screen.getByRole("link", { name: /Teslim Edildi/ })).toHaveAttribute("href", BUYER_ORDER_HREF.delivered);
    const cash = screen.getByRole("region", { name: "30 günlük ödeme takvimi" });
    expect(cash.querySelector(`a[href="${BUYER_ORDER_HREF.delivered}"]`)).not.toBeNull();
  });

  it("analitik hatası: 'henüz huni verisi yok' yerine tekrar-dene'li hata (O-102)", () => {
    const retry = vi.fn();
    render(<SatinalmaIhaleTab data={dash} showKpis={false} analyticsError onRetryAnalytics={retry} />);
    expect(screen.queryByText("Henüz huni verisi yok")).toBeNull();
    expect(screen.getByText("Grafik verileri alınamadı")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Tekrar dene" }));
    expect(retry).toHaveBeenCalled();
  });
});

describe("KpiCard — bağlantısız kart (D-292)", () => {
  it("href yoksa bağlantı çizilmez", () => {
    render(<KpiCard label="Tasarruf" value="1" />);
    expect(screen.getByText("Tasarruf")).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
  });
});

describe("Satış hunisi oranı (O-041)", () => {
  it("conversionFrom verilirse oran o aşamaya göre — ayrık kardeş aşamada %100'ü aşmaz", () => {
    render(
      <FunnelChart
        stages={[
          { key: "submitted", label: "Teklif Verildi", count: 400, noConversion: true },
          { key: "evaluating", label: "Değerlendirmede", count: 101 },
          { key: "won", label: "Kazanıldı", count: 196, conversionFrom: "submitted" },
        ]}
      />,
    );
    const won = screen.getByText("Kazanıldı").closest("li")!;
    expect(won.textContent).toMatch(/%49/);
    expect(won.textContent).not.toMatch(/%194/);
  });

  const st = {
    currency: "TRY",
    revenueTrend: [],
    winLoss: [],
    pipeline: [
      { key: "invites", label: "Davet", count: 10, amountTry: null },
      { key: "submitted", label: "Teklif Verildi", count: 400, amountTry: 0 },
      { key: "evaluating", label: "Değerlendirmede", count: 101, amountTry: 0 },
      { key: "won", label: "Kazanıldı", count: 196, amountTry: 0 },
    ],
    pareto: { rows: [], totalTry: 0, concentrationWarning: true },
    categoryWinRate: [],
    responseTrend: [],
    missed: { count: 2, amountTry: null },
  } as unknown as SatisAnalytics;

  it("Gelir sekmesi: Kazanıldı Teklif Verildi'ye göre; bağlantılar /company/satis#acik-talepler (O-106)", () => {
    render(<SatisGelirTab analytics={st} loading={false} />);
    const won = screen.getByText(/^Kazanıldı/).closest("li")!;
    expect(won.textContent).toMatch(/%49/);
    for (const a of document.querySelectorAll("a")) expect(a.getAttribute("href")).not.toBe("/company/satis/acik-talepler");
  });

  it("Müşteri sekmesi: satış terimi ve yeni rota", () => {
    render(<SatisMusteriTab analytics={st} loading={false} />);
    expect(screen.getByRole("link", { name: "Açık taleplere göz at" })).toHaveAttribute("href", "/company/satis#acik-talepler");
    expect(document.body.textContent).not.toMatch(/satın alma tale/i);
    for (const a of document.querySelectorAll("a")) expect(a.getAttribute("href")).not.toBe("/company/satis/acik-talepler");
  });
});

describe("MiniBars — 90 gün (O-042)", () => {
  it("bütün çubuklar görünüm alanının içinde ve pozitif genişlikte", () => {
    const data = Array.from({ length: 90 }, (_, i) => ({ date: `2026-07-${String((i % 28) + 1).padStart(2, "0")}-${i}`, views: i > 34 ? 3 : 0 }));
    const { container } = render(<MiniBars data={data} />);
    const rects = [...container.querySelectorAll("rect")];
    expect(rects).toHaveLength(90);
    for (const r of rects) {
      const x = Number(r.getAttribute("x"));
      const w = Number(r.getAttribute("width"));
      expect(w).toBeGreaterThan(0);
      expect(x + w).toBeLessThanOrEqual(100 + 1e-9);
    }
  });
});

describe("TedarikciTab — sayfa dönemi (O-104)", () => {
  const metric = { fromPool: 0, totalLabel: "" };
  const comp = (n: string) => ({ tenderNumber: n, title: `Talep ${n}`, bidderCount: 1, distribution: [] });
  const row = (name: string) => ({ rank: 1, shortName: name, tendersBidOn: 1, averageRank: 1, totalBids: 1 });
  const data: TedarikciTabData = {
    uniqueBiddersMonth: metric, uniqueBiddersYear: metric, bidsCountMonth: metric, bidsCountYear: metric,
    averageBidsMonth: metric, averageBidsYear: metric,
    topSuppliersMonth: [row("AYX")], topSuppliersYear: [row("YILX")],
    competitiveMonth: comp("AY-1"), competitiveYear: comp("YIL-1"),
  };

  it("çeyrekte yıl verisi + açık not; kart içi 'Bu Ay' seçicisi yok", () => {
    render(<TedarikciTab data={data} period="quarter" />);
    expect(screen.getByText("YILX")).toBeInTheDocument();
    expect(screen.queryByText("AYX")).toBeNull();
    expect(screen.getByText(/bu yılın verisi gösteriliyor/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Bu Ay" })).toBeNull();
  });

  it("ayda ay verisi, not yok", () => {
    render(<TedarikciTab data={data} period="month" />);
    expect(screen.getByText("AYX")).toBeInTheDocument();
    expect(screen.queryByText(/bu yılın verisi gösteriliyor/)).toBeNull();
  });
});

describe("TasarrufTab — 0,00'lık talepler sıralanmaz (D-297)", () => {
  const metrics = { totalSavings: 0, totalVolume: 0, averageSavingsRate: 0 };
  const base: TasarrufTabData = {
    currency: "TRY", month: metrics, year: metrics,
    topSavingsMonth: [], topSavingsYear: [{ rank: 1, tenderNumber: "T-1", title: "Sıfır talep", amount: 0 }],
    categoryMonth: [], categoryYear: [], currencyMonth: [], currencyYear: [],
  };
  it("yalnız sıfır tasarruflu satır varsa boş durum", () => {
    render(<TasarrufTab data={base} period="year" />);
    expect(screen.queryByText("Sıfır talep")).toBeNull();
    expect(screen.getByText("Bu dönemde tasarruf sağlanan satın alma talebi yok.")).toBeInTheDocument();
  });
});

const insights = (over: Partial<InsightsResponse["inquiries"]> = {}): InsightsResponse => ({
  days: 30, generatedAt: "2026-09-30T00:00:00Z", series: [],
  views: { profile: { current: 1, previous: 0 }, product: { current: 0, previous: 0 }, identifiedVisitors: { current: 0, previous: 0 } },
  topProducts: [], viewerCities: [{ city: "İstanbul", count: 2 }],
  inquiries: { received: 3, replied: 3, medianFirstReplyHours: 0, replyWindowDays: 90, ...over },
  connections: { invitesReceived: 0, accepted: 0 }, listingInvitations: 0, bids: { submitted: 0, won: 0 },
});

describe("InsightsView", () => {
  it("1 saatin altı '<1 sa' (O-041) ve şehir adı useCityLabel'dan (D-298)", () => {
    h.insights.data = insights();
    render(<InsightsView />);
    expect(screen.getByText("<1 sa")).toBeInTheDocument();
    expect(screen.queryByText("0 sa")).toBeNull();
    expect(screen.getByText("city:İstanbul")).toBeInTheDocument();
  });

  it("1 saat ve üstü ondalıklı saat", () => {
    h.insights.data = insights({ medianFirstReplyHours: 6.4 });
    render(<InsightsView />);
    expect(screen.getByText("6,4 sa")).toBeInTheDocument();
  });

  it("hata durumunda Tekrar dene (D-296)", () => {
    h.insights.isError = true;
    render(<InsightsView />);
    fireEvent.click(screen.getByRole("button", { name: "Tekrar dene" }));
    expect(h.insights.refetch).toHaveBeenCalled();
  });
});

describe("VisitorsView", () => {
  it("hata durumunda Tekrar dene (D-296)", () => {
    h.visitors.isError = true;
    render(<VisitorsView />);
    fireEvent.click(screen.getByRole("button", { name: "Tekrar dene" }));
    expect(h.visitors.refetch).toHaveBeenCalled();
  });

  it("ziyaretçi satırında şehir okuyucunun dilinde (D-298)", () => {
    const d: VisitorsResponse = {
      days: 30, total: 1, profileViews: 1, productViews: 0, identified: 1, anonymous: 0, locked: false,
      page: 1, pageSize: 20, totalItems: 1, previous: { total: 0, identified: 0 }, daily: [],
      items: [{ company: { id: "c1", rothernId: null, name: "Firma A", slug: null, city: "İstanbul", activities: [], verified: false, logoUrl: null }, visits: 1, lastViewedAt: "2026-09-05T10:00:00Z", profileViews: 1, products: [], connected: false }],
    };
    h.visitors.data = d;
    render(<VisitorsView />);
    expect(screen.getByText("city:İstanbul")).toBeInTheDocument();
  });
});
