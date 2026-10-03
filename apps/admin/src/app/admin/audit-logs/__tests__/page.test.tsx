// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  query: { data: undefined as unknown, isError: false, isLoading: false } as {
    data: unknown;
    isError: boolean;
    isLoading: boolean;
    refetch?: () => void;
  },
  admin: { role: "SUPER_ADMIN" } as { role: string } | null,
  auditCalls: 0,
  auditParams: [] as unknown[],
  search: "",
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: h.replace, push: vi.fn() }),
  usePathname: () => "/admin/audit-logs",
  useSearchParams: () => new URLSearchParams(h.search),
}));

vi.mock("@/hooks/use-audit-logs", () => ({
  useAuditLogs: (p: unknown) => {
    h.auditCalls += 1;
    h.auditParams.push(p);
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
  h.auditParams = [];
  h.search = "";
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

  it("hata durumu (isError) → 'Veri alınamadı' + Tekrar dene yeniden sorgular (arayüz testi D-228)", () => {
    const refetch = vi.fn();
    h.query = { data: undefined, isError: true, isLoading: false, refetch };
    render(<AuditLogsPage />);
    expect(screen.getByText(/Veri alınamadı/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Tekrar dene" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("sayfa ve süzgeçler URL'den okunur; sayfa değişimi URL'ye yazılır (arayüz testi D-228)", () => {
    h.search = "page=3&actorType=admin";
    h.query = {
      data: {
        items: [],
        pagination: { page: 3, pageSize: 20, total: 0, totalPages: 0 },
      },
      isError: false,
      isLoading: false,
    };
    render(<AuditLogsPage />);
    expect(h.auditParams.at(-1)).toMatchObject({ page: 3, actorType: "admin" });
    expect((screen.getByLabelText("Aktör tipi") as HTMLSelectElement).value).toBe("admin");
  });

  it("sonraki sayfa URL'ye yazılır", () => {
    h.search = "page=2";
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
            entityType: null,
            entityId: null,
            metadata: null,
            ip: null,
            createdAt: "2026-01-15T10:00:00.000Z",
          },
        ],
        pagination: { page: 2, pageSize: 20, total: 60, totalPages: 3 },
      },
      isError: false,
      isLoading: false,
    };
    render(<AuditLogsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Sonraki sayfa" }));
    expect(h.replace).toHaveBeenCalledWith("/admin/audit-logs?page=3", { scroll: false });
  });
});

describe("AuditLogsPage — derin bağlantı eylem süzgeci (arayüz testi kalanlar webC-4)", () => {
  it("listede olmayan ?action= değeri etiketiyle seçili görünür; 'Süzgeçleri temizle' çıplak adrese döner", () => {
    h.search = "action=admin.system.translation_backfill";
    render(<AuditLogsPage />);
    const select = screen.getByRole("combobox", { name: "Eylem" }) as HTMLSelectElement;
    expect(select.value).toBe("admin.system.translation_backfill");
    expect(select.selectedOptions[0].textContent).not.toBe("Tüm eylemler");
    expect(select.selectedOptions[0].textContent).toMatch(/çeviri/i);
    fireEvent.click(screen.getByRole("button", { name: "Süzgeçleri temizle" }));
    expect(h.replace).toHaveBeenCalledWith("/admin/audit-logs", { scroll: false });
  });

  it("süzgeç yokken temizleme düğmesi çizilmez", () => {
    render(<AuditLogsPage />);
    expect(screen.queryByRole("button", { name: "Süzgeçleri temizle" })).not.toBeInTheDocument();
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
