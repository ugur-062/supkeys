// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  companies: { data: undefined as unknown, isLoading: false },
  complaints: { data: undefined as unknown, isLoading: false },
}));

vi.mock("@/hooks/use-admin-companies", () => ({
  useAdminCompanies: () => h.companies,
  useAdminComplaints: () => h.complaints,
}));
vi.mock("@/components/layout/admin-shell", () => ({
  AdminShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import AdminDashboardPage from "../page";

function company(id: string, verification: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    name: `Firma ${id}`,
    supkeysId: `SK-${id}`,
    verification,
    createdAt: "2026-01-15T10:00:00.000Z",
    ...extra,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.companies = { data: undefined, isLoading: false };
  h.complaints = { data: undefined, isLoading: false };
});

describe("AdminDashboardPage — DashboardContent", () => {
  it("KPI sayaçlarını mock veriden hesaplar (toplam/doğrulanmış/kyc/şikayet)", () => {
    h.companies = {
      data: [
        company("1", "VERIFIED"),
        company("2", "VERIFIED"),
        company("3", "PENDING"),
        company("4", "REJECTED"),
      ],
      isLoading: false,
    };
    h.complaints = {
      data: [
        { id: "x1", against: { name: "A" }, reason: "spam", complainant: { name: "B" } },
        { id: "x2", against: { name: "C" }, reason: "sahte", complainant: { name: "D" } },
        { id: "x3", against: { name: "E" }, reason: "gecikme", complainant: { name: "F" } },
      ],
      isLoading: false,
    };
    render(<AdminDashboardPage />);

    // total=4, verified=2, pendingKyc=1, açık şikayet=3 — hepsi farklı.
    expect(screen.getByText("Toplam Firma")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    // pendingKyc sadece PENDING/UNVERIFIED = 1; açık şikayet = 3.
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("son firmaları ve açık şikayetleri listeler + tarih formatlar", () => {
    h.companies = {
      data: [company("1", "VERIFIED", { supkeysId: null })],
      isLoading: false,
    };
    h.complaints = {
      data: [
        { id: "x1", against: { name: "Kötü Firma" }, reason: "spam", complainant: { name: "Şikayetçi" } },
      ],
      isLoading: false,
    };
    render(<AdminDashboardPage />);

    expect(screen.getByText("Firma 1")).toBeInTheDocument();
    // supkeysId null → "—" fallback
    expect(screen.getByText("—")).toBeInTheDocument();
    // safeFormat(createdAt, "d MMM") → "15 Oca" (tr locale)
    expect(screen.getByText("15 Oca")).toBeInTheDocument();

    expect(screen.getByText("Kötü Firma")).toBeInTheDocument();
    expect(screen.getByText(/spam · şikayet eden: Şikayetçi/)).toBeInTheDocument();
  });

  it("boş durum → 'Firma yok' + 'Açık şikayet yok'", () => {
    h.companies = { data: [], isLoading: false };
    h.complaints = { data: [], isLoading: false };
    render(<AdminDashboardPage />);

    expect(screen.getByText("Firma yok")).toBeInTheDocument();
    expect(screen.getByText("Açık şikayet yok")).toBeInTheDocument();
  });

  it("yükleniyor durumu → her iki kartta 'Yükleniyor…'", () => {
    h.companies = { data: undefined, isLoading: true };
    h.complaints = { data: undefined, isLoading: true };
    render(<AdminDashboardPage />);

    expect(screen.getAllByText("Yükleniyor…")).toHaveLength(2);
  });
});
