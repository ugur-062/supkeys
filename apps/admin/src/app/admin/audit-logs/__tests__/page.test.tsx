// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  query: { data: undefined as unknown, isError: false, isLoading: false },
}));

vi.mock("@/hooks/use-audit-logs", () => ({
  useAuditLogs: () => h.query,
}));
vi.mock("@/components/layout/admin-shell", () => ({
  AdminShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import AuditLogsPage from "../page";

beforeEach(() => {
  vi.clearAllMocks();
  h.query = { data: undefined, isError: false, isLoading: false };
});

describe("AuditLogsPage", () => {
  it("mock kayıtları satır olarak render eder (eylem etiketi + aktör + e-posta)", () => {
    h.query = {
      data: {
        items: [
          {
            id: "a1",
            tenantId: null,
            actorType: "admin",
            actorId: "adm1",
            actorEmail: "admin@supkeys.com",
            action: "auth.login",
            entityType: "Company",
            entityId: "company-123456789",
            metadata: { ip: "1.2.3.4" },
            ip: "1.2.3.4",
            createdAt: "2026-01-15T10:00:00.000Z",
          },
        ],
        pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
      },
      isError: false,
      isLoading: false,
    };
    render(<AuditLogsPage />);

    // Satırı e-posta hücresinden bul; "Admin" aktör-tipi filtre <option>'unda
    // da geçtiği için rozeti satır içine kısıtla.
    const row = screen.getByText("admin@supkeys.com").closest("tr") as HTMLElement;
    // ACTION_LABELS["auth.login"] = "Giriş"
    expect(within(row).getByText("Giriş")).toBeInTheDocument();
    // ACTOR_META admin label
    expect(within(row).getByText("Admin")).toBeInTheDocument();
    expect(within(row).getByText(/ip: 1.2.3.4/)).toBeInTheDocument();
  });

  it("yükleniyor durumu → 'Yükleniyor...'", () => {
    h.query = { data: undefined, isError: false, isLoading: true };
    render(<AuditLogsPage />);
    expect(screen.getByText("Yükleniyor...")).toBeInTheDocument();
  });

  it("boş durum → 'Kayıt bulunamadı'", () => {
    h.query = {
      data: { items: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } },
      isError: false,
      isLoading: false,
    };
    render(<AuditLogsPage />);
    expect(screen.getByText("Kayıt bulunamadı")).toBeInTheDocument();
  });

  it("hata durumu (isError) → 'Veri alınamadı'", () => {
    h.query = { data: undefined, isError: true, isLoading: false };
    render(<AuditLogsPage />);
    expect(screen.getByText(/Veri alınamadı/)).toBeInTheDocument();
  });
});
