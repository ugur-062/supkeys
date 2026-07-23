// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  auth: {
    user: { roles: [] as string[] } as { roles: string[] } | null,
    company: { tier: "GOLD" } as { tier?: string } | undefined,
  },
  canAct: false,
}));

vi.mock("@/hooks/use-company-auth", () => ({
  useCompanyAuth: () => h.auth,
  useHasCompanyPermission: () => h.canAct,
}));
vi.mock("@/hooks/use-company-approvals", () => ({
  usePendingApprovalCount: () => ({ data: 0 }),
}));
vi.mock("@/lib/company/portal-store", () => ({
  usePortalStore: (
    sel: (s: {
      lastPortal: null;
      sidebarPinned: boolean;
      setLastPortal: () => void;
      toggleSidebarPinned: () => void;
    }) => unknown,
  ) =>
    sel({
      lastPortal: null,
      sidebarPinned: true,
      setLastPortal: vi.fn(),
      toggleSidebarPinned: vi.fn(),
    }),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/company/onaylar",
}));

import { CompanySidebarContent } from "../sidebar";

beforeEach(() => {
  vi.clearAllMocks();
  h.canAct = false;
  h.auth.company = { tier: "GOLD" };
});

describe("CompanySidebarContent — minimal kabuk modu", () => {
  it("ONAYLAYICI-only: panel nav'ı YOK; Onaylar + Ayarlar VAR", () => {
    h.auth.user = { roles: ["ONAYLAYICI"] };
    h.canAct = true;
    render(<CompanySidebarContent expanded showPin={false} />);
    expect(screen.queryByText("Açık İhaleler")).not.toBeInTheDocument();
    expect(screen.queryByText("Tekliflerim")).not.toBeInTheDocument();
    expect(screen.queryByText("Profilim")).not.toBeInTheDocument();
    expect(screen.getByText("Onaylar")).toBeInTheDocument();
    expect(screen.getByText("Ayarlar")).toBeInTheDocument();
  });

  it("rolsüz üye: yalnız Ayarlar (Onaylar da yok)", () => {
    h.auth.user = { roles: [] };
    h.canAct = false;
    render(<CompanySidebarContent expanded showPin={false} />);
    expect(screen.queryByText("Onaylar")).not.toBeInTheDocument();
    expect(screen.queryByText("Açık İhaleler")).not.toBeInTheDocument();
    expect(screen.getByText("Ayarlar")).toBeInTheDocument();
  });

  it("REGRESYON (Faz R): YONETICI etiketi işlem-rolsüz de panelleri görür (salt-okunur gözetim)", () => {
    h.auth.user = { roles: ["YONETICI"] };
    h.canAct = true;
    render(<CompanySidebarContent expanded showPin={false} />);
    // GOLD yönetici → available=[satinalma, satis], aktif=satinalma nav'ı.
    expect(screen.getByText("İhalelerim")).toBeInTheDocument();
    expect(screen.getByText("Ayarlar")).toBeInTheDocument();
  });

  it("ONAYLAYICI+SATISCI: işlem rolü var → satış nav'ı görünür", () => {
    h.auth.user = { roles: ["ONAYLAYICI", "SATISCI"] };
    h.canAct = true;
    render(<CompanySidebarContent expanded showPin={false} />);
    expect(screen.getByText("Açık İhaleler")).toBeInTheDocument();
    expect(screen.getByText("Onaylar")).toBeInTheDocument();
  });
});
