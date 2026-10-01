// @vitest-environment jsdom
/**
 * Şirketim › Genel Bakış KPI bağlantıları (arayüz testi webC-04):
 *  - D-292: Tasarruf kartı rapor bağlantısını yalnız Gold + "buy:reports:view"
 *    olan kullanıcıya verir (paket kapısının içinde rol kontrolü); izni
 *    olmayana bağlantısız kart — tıklayınca yetki duvarı açılmaz.
 *  - O-035: "Devam Eden Sipariş" sayımla aynı durumlara süzülmüş listeye gider.
 *  - O-104: Tedarikçi sekmesine sayfanın dönemi verilir.
 */
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  user: { isOwner: false, permissions: ["buy:view"] as string[] },
  period: "quarter" as "month" | "quarter" | "year" | "custom",
  tab: "tedarikci",
  tedarikciProps: null as null | Record<string, unknown>,
}));
const q = (data: unknown) => ({ data, isError: false, isLoading: false, refetch: vi.fn() });

vi.mock("@/hooks/use-company-auth", () => ({
  useCompanyAuth: () => ({ company: { name: "Alıcı AŞ", tier: "GOLD" }, user: h.user }),
}));
vi.mock("@/hooks/use-company-dashboard", () => ({
  useSatinalmaDashboard: () => q({ openCount: 1, bidsReceived: 2, awarded: 3, ongoingOrders: 4, invitedPending: 0, openTendersOwn: [], openTendersCompany: [] }),
  useSatinalmaTasarruf: () => q({ currency: "TRY", month: { totalSavings: 1, totalVolume: 10, averageSavingsRate: 10 }, year: { totalSavings: 5, totalVolume: 50, averageSavingsRate: 10 } }),
  useSatinalmaTedarikci: () => q({}),
  useSatinalmaAnalytics: () => q(undefined),
  useSatisAnalytics: () => q(undefined),
}));
vi.mock("@/hooks/use-company-listings", () => ({ useMyBids: () => q(undefined) }));
vi.mock("@/hooks/use-company-orders", () => ({ useOrders: () => q(undefined) }));
vi.mock("@/hooks/use-company-views", () => ({ useVisitors: () => q(undefined) }));
vi.mock("@/hooks/use-dashboard-params", () => ({
  useDashboardParams: () => ({ period: h.period, from: null, to: null, tab: h.tab, setParams: vi.fn() }),
}));
vi.mock("@/components/company/company-action-center", () => ({ CompanyActionCenter: () => null }));
vi.mock("@/components/tcmb-rates-widget", () => ({ TcmbRatesChip: () => null }));
vi.mock("@/components/dashboard/period-controls", () => ({ PeriodControls: () => null }));
// Sekmeler `next/dynamic` ile tembel — testte yalnız Tedarikçi sekmesine giden prop'lar izlenir.
vi.mock("next/dynamic", () => ({
  default: () => (props: Record<string, unknown>) => {
    if ("data" in props && "period" in props && !("analytics" in props)) h.tedarikciProps = props;
    return null;
  },
}));

import { CompanyOverview } from "../company-overview";

beforeEach(() => {
  h.user = { isOwner: false, permissions: ["buy:view"] };
  h.period = "quarter";
  h.tab = "tedarikci";
  h.tedarikciProps = null;
});

const savingsCard = () => screen.getByText("Tasarruf", { selector: "p" }).closest("a, div.rounded-xl")!;

describe("CompanyOverview — KPI bağlantıları", () => {
  it("yalnız buy:view: Tasarruf kartı bağlantısız (D-292)", () => {
    render(<CompanyOverview />);
    const card = savingsCard();
    expect(card.tagName).toBe("DIV");
    expect(document.querySelector('a[href*="raporlar/tasarruf"]')).toBeNull();
  });

  it("buy:reports:view ile Gold: Tasarruf kartı rapora gider", () => {
    h.user = { isOwner: false, permissions: ["buy:view", "buy:reports:view"] };
    render(<CompanyOverview />);
    expect(document.querySelector('a[href="/company/sirketim/raporlar/tasarruf"]')).not.toBeNull();
  });

  it("Devam Eden Sipariş süzülmüş listeye; Tedarikçi sekmesi sayfa dönemini alır (O-035, O-104)", () => {
    render(<CompanyOverview />);
    expect(
      document.querySelector('a[href="/company/satinalma/siparisler?status=PENDING,ACCEPTED,IN_DELIVERY,DELIVERED"]'),
    ).not.toBeNull();
    expect(h.tedarikciProps?.period).toBe("quarter");
  });
});
