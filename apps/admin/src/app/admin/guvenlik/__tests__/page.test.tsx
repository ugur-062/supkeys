// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  query: {
    data: undefined as unknown,
    isError: false,
    isLoading: false,
    refetch: vi.fn(),
  },
  lastParams: undefined as { page?: number } | undefined,
}));

vi.mock("@/hooks/use-audit-logs", () => ({
  useAuditLogs: (p: { page?: number }) => {
    h.lastParams = p;
    return h.query;
  },
}));
vi.mock("@/hooks/use-admin-auth", () => ({
  useAdminAuth: () => ({ admin: { role: "SUPER_ADMIN" } }),
}));
vi.mock("@/components/layout/admin-shell", () => ({
  AdminShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import AdminGuvenlikPage from "../page";

function fail(id: string, reason: string, portal: string, ip = "9.9.9.9") {
  return {
    id,
    tenantId: null,
    actorType: portal === "admin" ? "admin" : "company",
    actorId: null,
    actorEmail: "hedef@ornek.com",
    action: "auth.login_failed",
    entityType: null,
    entityId: null,
    metadata: { reason, portal },
    ip,
    createdAt: "2026-01-15T10:00:00.000Z",
  };
}

beforeEach(() => {
  h.query = { data: undefined, isError: false, isLoading: false, refetch: vi.fn() };
  h.lastParams = undefined;
});

describe("Güvenlik sayfası", () => {
  it("neden ve portal etiketli yazılır (D-019)", () => {
    h.query.data = {
      items: [fail("1", "bad_credentials", "company"), fail("2", "bad_2fa_code", "admin")],
      pagination: { page: 1, pageSize: 100, total: 2, totalPages: 1 },
    };
    render(<AdminGuvenlikPage />);
    const table = screen.getByRole("table");
    expect(within(table).getByText("Hatalı e-posta veya şifre")).toBeInTheDocument();
    expect(within(table).getByText("Hatalı doğrulama kodu (2FA)")).toBeInTheDocument();
    expect(within(table).getByText("Firma paneli")).toBeInTheDocument();
    expect(within(table).getByText("Admin paneli")).toBeInTheDocument();
    expect(within(table).queryByText("bad_credentials")).not.toBeInTheDocument();
    expect(within(table).queryByText("company")).not.toBeInTheDocument();
  });

  it("API hatasında 'kayıt yok' değil hata + tekrar dene (D-019)", () => {
    h.query.isError = true;
    render(<AdminGuvenlikPage />);
    expect(screen.queryByText("Başarısız giriş denemesi kaydı yok")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Tekrar dene/i })).toBeInTheDocument();
  });

  it("en çok deneme kartları yalnız 1. sayfada (D-226)", async () => {
    const user = userEvent.setup();
    h.query.data = {
      items: [fail("1", "bad_credentials", "company"), fail("2", "bad_credentials", "company")],
      pagination: { page: 1, pageSize: 100, total: 150, totalPages: 2 },
    };
    render(<AdminGuvenlikPage />);
    expect(screen.getByText(/En çok deneme yapan IP/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Sonraki sayfa" }));
    expect(h.lastParams?.page).toBe(2);
    expect(screen.queryByText(/En çok deneme yapan IP/)).not.toBeInTheDocument();
  });
});
