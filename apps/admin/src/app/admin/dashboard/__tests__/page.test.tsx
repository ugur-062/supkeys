// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  companies: { data: undefined as unknown, isLoading: false },
  complaints: { data: undefined as unknown, isLoading: false },
  stats: { data: undefined as unknown, isLoading: false },
  admin: { role: "SUPER_ADMIN" } as { role: string } | null,
  companiesOpts: [] as unknown[],
}));

vi.mock("@/hooks/use-admin-auth", () => ({
  useAdminAuth: () => ({ admin: h.admin }),
}));

vi.mock("@/hooks/use-admin-products", () => ({
  useAdminProductStats: () => ({ data: { pending: 2, rejected: 0, oldestPendingSince: null }, isLoading: false }),
}));
vi.mock("@/hooks/use-admin-companies", () => ({
  useAdminCompanies: (_p: unknown, opts?: unknown) => {
    h.companiesOpts.push(opts);
    return h.companies;
  },
  useAdminComplaints: () => h.complaints,
  useAdminCompanyStats: () => h.stats,
}));
vi.mock("@/components/layout/admin-shell", () => ({
  AdminShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import AdminDashboardPage from "../page";

function statsFixture(over: Record<string, unknown> = {}) {
  return {
    totalCompanies: 4,
    verified: 2,
    pendingKyc: 1,
    pendingReview: 1,
    rejected: 1,
    openComplaints: 3,
    tierBreakdown: { STANDART: 3, SILVER: 0, GOLD: 1 },
    countryBreakdown: [
      { country: "TR", count: 3 },
      { country: "DE", count: 1 },
    ],
    last30Days: { newCompanies: 2, newListings: 5, newOrders: 1 },
    expiringMemberships: [],
    oldestPendingSince: null,
    funnel: { signedUp: 4, onboarded: 3, kycSubmitted: 2, verified: 2 },
    ...over,
  };
}

function company(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    name: `Firma ${id}`,
    rothernId: `SK-${id}`,
    country: "TR",
    createdAt: "2026-01-15T10:00:00.000Z",
    ...extra,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.companies = { data: undefined, isLoading: false };
  h.complaints = { data: undefined, isLoading: false };
  h.stats = { data: undefined, isLoading: false };
  h.admin = { role: "SUPER_ADMIN" };
  h.companiesOpts = [];
});

describe("AdminDashboardPage — DashboardContent", () => {
  it("KPI sayaçlarını server-side stats'tan gösterir", () => {
    h.stats = { data: statsFixture(), isLoading: false };
    h.companies = { data: { items: [], total: 0 }, isLoading: false };
    h.complaints = { data: { items: [], total: 0 }, isLoading: false };
    render(<AdminDashboardPage />);

    expect(screen.getByText("Toplam Firma")).toBeInTheDocument();
    // "4" hem Toplam Firma KPI'sında hem huni "Kayıt" adımında.
    expect(screen.getAllByText("4").length).toBeGreaterThanOrEqual(1);
    // "2" hem Doğrulanmış KPI'sında hem "Yeni firma (30 gün)" mini-stat'ında.
    expect(screen.getAllByText("2").length).toBeGreaterThanOrEqual(1);
    // "3" hem Açık Şikayet KPI'sında hem ülke dağılımında (TR=3) geçer.
    expect(screen.getAllByText("3").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("İnceleme Bekleyen")).toBeInTheDocument();
    // Toplam Firma alt yazısı doğrulama kırılımıdır (ücretsiz dönem: üyelik
    // kademesi kırılımı API'den gelse de basılmaz).
    expect(
      screen.getByText("2 doğrulanmış · 1 doğrulanmamış · 1 reddedildi"),
    ).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/gold|silver|standart|üyelik/i);
    // Kayıt hunisi (Faz 2) — 4 adım ve oran yüzdesi render olur.
    expect(screen.getByText("Kayıt Hunisi")).toBeInTheDocument();
    expect(screen.getByText("Kayıt tamamlandı")).toBeInTheDocument();
    expect(screen.getByText("%75")).toBeInTheDocument(); // 3/4
  });

  it("ülke dağılımı ve son firmaları listeler + tarih formatlar", () => {
    h.stats = { data: statsFixture(), isLoading: false };
    h.companies = {
      data: { items: [company("1", { rothernId: null })], total: 1 },
      isLoading: false,
    };
    h.complaints = {
      data: {
        items: [
          {
            id: "x1",
            against: { id: "a1", name: "Kötü Firma" },
            reason: "spam",
            complainant: { name: "Şikayetçi" },
          },
        ],
        total: 1,
      },
      isLoading: false,
    };
    render(<AdminDashboardPage />);

    expect(screen.getByText(/Firma 1/)).toBeInTheDocument();
    // rothernId null → "—" fallback
    expect(screen.getByText("—")).toBeInTheDocument();
    // safeFormat(createdAt, "d MMM") → "15 Oca" (tr locale)
    expect(screen.getByText("15 Oca")).toBeInTheDocument();
    // Ülke dağılımı: Türkiye 3, Almanya 1
    expect(screen.getByText(/Türkiye/)).toBeInTheDocument();
    expect(screen.getByText(/Almanya/)).toBeInTheDocument();

    expect(screen.getByText("Kötü Firma")).toBeInTheDocument();
    expect(
      screen.getByText(/spam · şikayet eden: Şikayetçi/),
    ).toBeInTheDocument();
  });

  it("ücretsiz dönem: 'Süresi Yaklaşan Üyelikler' paneli yok (API alanı gelse de)", () => {
    const in10d = new Date(Date.now() + 10 * 86_400_000).toISOString();
    h.stats = {
      data: statsFixture({
        expiringMemberships: [
          { id: "e1", name: "Bitecek A.Ş.", rothernId: "SK-E1", membershipEndAt: in10d },
        ],
        expiringMembershipsCount: 1,
      }),
      isLoading: false,
    };
    h.companies = { data: { items: [], total: 0 }, isLoading: false };
    h.complaints = { data: { items: [], total: 0 }, isLoading: false };
    render(<AdminDashboardPage />);

    expect(screen.queryByText("Bitecek A.Ş.")).not.toBeInTheDocument();
    expect(screen.queryByText("Süresi Yaklaşan Üyelikler")).not.toBeInTheDocument();
    expect(document.body.innerHTML).not.toContain("expiring=30");
  });

  it("boş durum → 'Firma yok' + 'Açık şikayet yok'", () => {
    h.stats = { data: statsFixture({ countryBreakdown: [] }), isLoading: false };
    h.companies = { data: { items: [], total: 0 }, isLoading: false };
    h.complaints = { data: { items: [], total: 0 }, isLoading: false };
    render(<AdminDashboardPage />);

    expect(screen.getByText("Firma yok")).toBeInTheDocument();
    expect(screen.getByText("Açık şikayet yok")).toBeInTheDocument();
  });

  it("yükleniyor durumu → panellerde 'Yükleniyor…'", () => {
    h.stats = { data: undefined, isLoading: true };
    h.companies = { data: undefined, isLoading: true };
    h.complaints = { data: undefined, isLoading: true };
    render(<AdminDashboardPage />);

    // 3 panel: ülke dağılımı, son firmalar, açık şikayetler.
    expect(screen.getAllByText("Yükleniyor…")).toHaveLength(3);
  });

  it("İnceleme Bekleyen kartı Başvurular kuyruğuna gider (queue=kyc evreni) — LU-11", () => {
    h.stats = { data: statsFixture(), isLoading: false };
    h.companies = { data: { items: [], total: 0 }, isLoading: false };
    h.complaints = { data: { items: [], total: 0 }, isLoading: false };
    render(<AdminDashboardPage />);
    const card = screen.getByText("İnceleme Bekleyen").closest("a");
    expect(card).toHaveAttribute("href", "/admin/basvurular");
    expect(h.companiesOpts.at(-1)).toEqual({ enabled: true });
  });

  it("SUPPORT: firma listesi istenmez, Son Firmalar gizli, 403 veren sayfalara bağlantı yok — LU-11", () => {
    h.admin = { role: "SUPPORT" };
    h.stats = { data: statsFixture(), isLoading: false };
    h.companies = { data: undefined, isLoading: false };
    h.complaints = {
      data: {
        items: [
          {
            id: "x1",
            against: { id: "a1", name: "Kötü Firma" },
            reason: "spam",
            complainant: { name: "Şikayetçi" },
          },
        ],
        total: 1,
      },
      isLoading: false,
    };
    render(<AdminDashboardPage />);

    expect(h.companiesOpts.at(-1)).toEqual({ enabled: false });
    expect(screen.queryByText("Son Firmalar")).not.toBeInTheDocument();
    expect(screen.queryByText("Firma yok")).not.toBeInTheDocument();
    expect(screen.getByText("Toplam Firma").closest("a")).toBeNull();
    expect(screen.getByText("İnceleme Bekleyen").closest("a")).toBeNull();
    for (const a of screen.getAllByRole("link")) {
      expect(a.getAttribute("href") ?? "").not.toMatch(/^\/admin\/(firmalar|basvurular)/);
    }
    expect(screen.getByText("Kötü Firma").closest("a")).toHaveAttribute(
      "href",
      "/admin/sikayetler",
    );
  });
});
