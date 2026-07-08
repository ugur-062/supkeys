// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  auth: {
    user: { roles: [] as string[] } as { roles: string[] } | null,
    company: { tier: "STANDARD" } as { tier?: string } | undefined,
  },
  replace: vi.fn(),
  setLastPortal: vi.fn(),
}));

vi.mock("@/hooks/use-company-auth", () => ({
  useCompanyAuth: () => h.auth,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: h.replace }),
}));
vi.mock("@/lib/company/portal-store", () => ({
  usePortalStore: (sel: (s: { setLastPortal: typeof h.setLastPortal }) => unknown) =>
    sel({ setLastPortal: h.setLastPortal }),
}));
vi.mock("@/components/company-shell/premium-gate", () => ({
  PremiumGate: () => <div data-testid="premium-gate">GATE</div>,
}));

import { PortalGuard } from "../portal-guard";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PortalGuard", () => {
  it("rol + tier uygun → içerik render, son portal kaydedilir", () => {
    h.auth.user = { roles: ["YONETICI"] };
    h.auth.company = { tier: "PAKET" };
    render(
      <PortalGuard portal="satis">
        <div data-testid="child">SATIŞ</div>
      </PortalGuard>,
    );
    expect(screen.getByTestId("child")).toBeInTheDocument();
    expect(h.setLastPortal).toHaveBeenCalledWith("satis");
    expect(h.replace).not.toHaveBeenCalled();
  });

  it("satınalma rolü var ama STANDARD → premium kapısı (yönlendirme yok)", () => {
    h.auth.user = { roles: ["YONETICI"] };
    h.auth.company = { tier: "STANDARD" };
    render(
      <PortalGuard portal="satinalma">
        <div data-testid="child">SATINALMA</div>
      </PortalGuard>,
    );
    expect(screen.getByTestId("premium-gate")).toBeInTheDocument();
    expect(screen.queryByTestId("child")).not.toBeInTheDocument();
    expect(h.replace).not.toHaveBeenCalled();
  });

  it("sadece Satışçı → Satınalma'da 'yetkiniz yok' ekranı (yönlendirme YOK)", () => {
    h.auth.user = { roles: ["SATISCI"] };
    h.auth.company = { tier: "PAKET" };
    render(
      <PortalGuard portal="satinalma">
        <div data-testid="child">SATINALMA</div>
      </PortalGuard>,
    );
    expect(screen.queryByTestId("child")).not.toBeInTheDocument();
    expect(screen.getByText(/erişim yetkiniz yok/i)).toBeInTheDocument();
    expect(screen.getByText(/Satın Almacı/)).toBeInTheDocument();
    expect(h.replace).not.toHaveBeenCalled();
  });

  it("sadece Satın Almacı → Satış'ta 'yetkiniz yok' ekranı", () => {
    h.auth.user = { roles: ["SATIN_ALMACI"] };
    h.auth.company = { tier: "PAKET" };
    render(
      <PortalGuard portal="satis">
        <div data-testid="child">SATIŞ</div>
      </PortalGuard>,
    );
    expect(screen.queryByTestId("child")).not.toBeInTheDocument();
    expect(screen.getByText(/erişim yetkiniz yok/i)).toBeInTheDocument();
    expect(screen.getByText(/Satışçı/)).toBeInTheDocument();
  });
});
