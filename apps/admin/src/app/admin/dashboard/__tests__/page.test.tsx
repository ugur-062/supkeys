// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  companies: { data: undefined as unknown, isLoading: false },
  complaints: { data: undefined as unknown, isLoading: false },
  stats: { data: undefined as unknown, isLoading: false },
}));

vi.mock("@/hooks/use-admin-companies", () => ({
  useAdminCompanies: () => h.companies,
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
    tierBreakdown: { PAKET: 1, STANDARD: 3 },
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
});

describe("AdminDashboardPage — DashboardContent", () => {
  it("KPI sayaçlarını server-side stats'tan gösterir", () => {
    h.stats = { data: statsFixture(), isLoading: false };
    h.companies = { data: { items: [], total: 0 }, isLoading: false };
    h.complaints = { data: [], isLoading: false };
    render(<AdminDashboardPage />);

    expect(screen.getByText("Toplam Firma")).toBeInTheDocument();
    // "4" hem Toplam Firma KPI'sında hem huni "Kayıt" adımında.
    expect(screen.getAllByText("4").length).toBeGreaterThanOrEqual(1);
    // "2" hem Doğrulanmış KPI'sında hem "Yeni firma (30 gün)" mini-stat'ında.
    expect(screen.getAllByText("2").length).toBeGreaterThanOrEqual(1);
    // "3" hem Açık Şikayet KPI'sında hem ülke dağılımında (TR=3) geçer.
    expect(screen.getAllByText("3").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("İnceleme Bekleyen")).toBeInTheDocument();
    // Tier breakdown alt yazısı
    expect(screen.getByText(/1 premium · 3 standart/)).toBeInTheDocument();
    // Kayıt hunisi (Faz 2) — 4 adım ve oran yüzdesi render olur.
    expect(screen.getByText("Kayıt Hunisi")).toBeInTheDocument();
    expect(screen.getByText("Onboarding tamam")).toBeInTheDocument();
    expect(screen.getByText("%75")).toBeInTheDocument(); // 3/4
  });

  it("ülke dağılımı ve son firmaları listeler + tarih formatlar", () => {
    h.stats = { data: statsFixture(), isLoading: false };
    h.companies = {
      data: { items: [company("1", { rothernId: null })], total: 1 },
      isLoading: false,
    };
    h.complaints = {
      data: [
        {
          id: "x1",
          against: { id: "a1", name: "Kötü Firma" },
          reason: "spam",
          complainant: { name: "Şikayetçi" },
        },
      ],
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

  it("süresi yaklaşan üyelikler gün rozeti ile listelenir", () => {
    const in10d = new Date(Date.now() + 10 * 86_400_000).toISOString();
    h.stats = {
      data: statsFixture({
        expiringMemberships: [
          { id: "e1", name: "Bitecek A.Ş.", rothernId: "SK-E1", membershipEndAt: in10d },
        ],
      }),
      isLoading: false,
    };
    h.companies = { data: { items: [], total: 0 }, isLoading: false };
    h.complaints = { data: [], isLoading: false };
    render(<AdminDashboardPage />);

    expect(screen.getByText("Bitecek A.Ş.")).toBeInTheDocument();
    expect(screen.getByText("10 gün")).toBeInTheDocument();
  });

  it("boş durum → 'Firma yok' + 'Açık şikayet yok' + üyelik boş mesajı", () => {
    h.stats = { data: statsFixture({ countryBreakdown: [] }), isLoading: false };
    h.companies = { data: { items: [], total: 0 }, isLoading: false };
    h.complaints = { data: [], isLoading: false };
    render(<AdminDashboardPage />);

    expect(screen.getByText("Firma yok")).toBeInTheDocument();
    expect(screen.getByText("Açık şikayet yok")).toBeInTheDocument();
    expect(
      screen.getByText("30 gün içinde bitecek üyelik yok"),
    ).toBeInTheDocument();
  });

  it("yükleniyor durumu → panellerde 'Yükleniyor…'", () => {
    h.stats = { data: undefined, isLoading: true };
    h.companies = { data: undefined, isLoading: true };
    h.complaints = { data: undefined, isLoading: true };
    render(<AdminDashboardPage />);

    // 4 panel: üyelikler, ülke dağılımı, son firmalar, açık şikayetler.
    expect(screen.getAllByText("Yükleniyor…")).toHaveLength(4);
  });
});
