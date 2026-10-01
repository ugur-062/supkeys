// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  query: { data: undefined as unknown, isError: false, isLoading: false },
  admin: { role: "SUPER_ADMIN" } as { role: string } | null,
  auditCalls: 0,
}));

vi.mock("@/hooks/use-audit-logs", () => ({
  useAuditLogs: () => {
    h.auditCalls += 1;
    return h.query;
  },
}));
vi.mock("@/hooks/use-admin-auth", () => ({
  useAdminAuth: () => ({ admin: h.admin }),
}));
vi.mock("@/components/layout/admin-shell", () => ({
  AdminShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import AuditLogsPage from "../page";

beforeEach(() => {
  vi.clearAllMocks();
  h.query = { data: undefined, isError: false, isLoading: false };
  h.admin = { role: "SUPER_ADMIN" };
  h.auditCalls = 0;
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
            actorEmail: "admin@rothern.com",
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
    const row = screen.getByText("admin@rothern.com").closest("tr") as HTMLElement;
    // ACTION_LABELS["auth.login"] = "Giriş"
    expect(within(row).getByText("Giriş")).toBeInTheDocument();
    // ACTOR_META admin label
    expect(within(row).getByText("Admin")).toBeInTheDocument();
    expect(within(row).getByText(/ip: 1.2.3.4/)).toBeInTheDocument();
  });

  it("firma aktörü: süzgeçte 'Firma' var, ölü tenant/supplier seçenekleri yok; satır rozeti 'Firma'", () => {
    h.query = {
      data: {
        items: [
          {
            id: "c1",
            tenantId: null,
            actorType: "company",
            actorId: "u1",
            actorEmail: "firma@ornek.com",
            action: "company.listing.published",
            entityType: null,
            entityId: null,
            metadata: null,
            ip: null,
            createdAt: "2026-01-15T10:00:00.000Z",
          },
        ],
        pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
      },
      isError: false,
      isLoading: false,
    };
    render(<AuditLogsPage />);
    const options = screen.getAllByRole("option").map((o) => (o as HTMLOptionElement).value);
    expect(options).toContain("company");
    expect(options).not.toContain("tenant");
    expect(options).not.toContain("supplier");
    // Eylem süzgeci önek grupları (API startsWith) — eski supplier.* adları yok.
    expect(options).toContain("company.listing");
    expect(options.some((v) => v.startsWith("supplier."))).toBe(false);
    // LU-11: duyuru ve e-posta yeniden gönderimi de süzülebilir.
    expect(options).toContain("admin.announcement.");
    expect(options).toContain("email.resent");
    const row = screen.getByText("firma@ornek.com").closest("tr") as HTMLElement;
    expect(within(row).getByText("Firma")).toBeInTheDocument();
    expect(within(row).getByText("İlan yayınlandı")).toBeInTheDocument();
  });

  it("varlık ve detay etiketli; 2FA/AI/dış davet eylemleri Türkçe (arayüz testi D-016)", () => {
    const base = {
      tenantId: null,
      actorType: "company",
      actorId: "u1",
      ip: null,
      createdAt: "2026-01-15T10:00:00.000Z",
    };
    h.query = {
      data: {
        items: [
          { ...base, id: "o1", actorEmail: "a@o.com", action: "admin.order.cancelled", entityType: "company_order", entityId: "ord1", metadata: { to: "CANCELLED", from: "DISPUTED" } },
          { ...base, id: "o2", actorEmail: "b@o.com", action: "auth.2fa_enabled", entityType: "company_user", entityId: "u1", metadata: null },
          { ...base, id: "o3", actorEmail: "c@o.com", action: "connection.external_tender_invite", entityType: "listing_bid", entityId: "b1", metadata: null },
        ],
        pagination: { page: 1, pageSize: 20, total: 3, totalPages: 1 },
      },
      isError: false,
      isLoading: false,
    };
    render(<AuditLogsPage />);
    const r1 = screen.getByText("a@o.com").closest("tr") as HTMLElement;
    expect(within(r1).getByText(/^Sipariş/)).toBeInTheDocument();
    expect(within(r1).getByText("sonra: İptal · önce: İhtilaflı")).toBeInTheDocument();
    expect(within(r1).queryByText(/company_order/)).not.toBeInTheDocument();
    const r2 = screen.getByText("b@o.com").closest("tr") as HTMLElement;
    expect(within(r2).getByText("İki adımlı doğrulama açıldı")).toBeInTheDocument();
    const r3 = screen.getByText("c@o.com").closest("tr") as HTMLElement;
    expect(within(r3).getByText("Talebe dışarıdan e-postayla davet")).toBeInTheDocument();
    expect(within(r3).getByText(/^Teklif/)).toBeInTheDocument();
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

describe("AuditLogsPage — rol kapısı (arayüz testi T-09 / D-033)", () => {
  it("SUPPORT adresle açınca denetim sorgusu atılmaz, yetki kartı çizilir", () => {
    h.admin = { role: "SUPPORT" };
    render(<AuditLogsPage />);
    expect(h.auditCalls).toBe(0);
    expect(screen.getByText("Bu sayfaya erişim yetkiniz yok.")).toBeInTheDocument();
  });
});
