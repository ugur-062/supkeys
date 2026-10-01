// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  admin: { role: "SUPER_ADMIN" } as { role: string } | null,
  suppressions: {
    data: undefined as unknown,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  },
  clearMutateAsync: vi.fn((_v: unknown) => Promise.resolve()),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
  system: {
    database: "up",
    bootAt: "2026-09-30T17:00:00.000Z",
    exchangeRates: { latestRateDate: "2026-09-30", stale: false, rates: { TRY: 1, USD: 49.0184 } },
    crons: [
      {
        key: "membership.downgradeExpired",
        label: "Üyelik süresi biteni STANDARD'a düşür",
        schedule: "günlük 03:00 + boot catch-up",
        lastRunAt: "2026-09-30T17:00:56.000Z",
        lastStatus: "ok",
        lastError: null,
        runCount: 1,
      },
      {
        key: "views.purge",
        label: "Deletes profile/product view records after 180 days",
        schedule: "nightly 04:20 (Istanbul)",
        lastRunAt: null,
        lastStatus: null,
        lastError: null,
        runCount: 0,
      },
      {
        key: "future.job",
        label: "Yeni iş",
        schedule: "her dakika",
        lastRunAt: null,
        lastStatus: null,
        lastError: null,
        runCount: 0,
      },
    ],
    timestamp: "2026-10-01T00:00:00.000Z",
  },
}));

vi.mock("sonner", () => ({ toast: h.toast }));
vi.mock("@/lib/api", () => ({ toastApiError: vi.fn() }));
vi.mock("@/hooks/use-admin-auth", () => ({
  useAdminAuth: () => ({ admin: h.admin }),
}));
vi.mock("@/components/layout/admin-shell", () => ({
  AdminShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/hooks/use-admin-system", () => ({
  useAdminSystem: () => ({ data: h.system, isLoading: false }),
  useRefreshRates: () => ({ mutate: vi.fn(), isPending: false }),
  useManualRate: () => ({ mutate: vi.fn(), isPending: false }),
  useStorageHealth: () => ({ data: undefined, isError: false }),
  useSuppressions: () => h.suppressions,
  useClearSuppression: () => ({ mutateAsync: h.clearMutateAsync, isPending: false }),
  useTimeSavingsConfig: () => ({ data: undefined, isLoading: false }),
  useUpdateTimeSavingsConfig: () => ({ mutate: vi.fn(), isPending: false }),
}));

import AdminSistemPage from "../page";

beforeEach(() => {
  vi.clearAllMocks();
  h.admin = { role: "SUPER_ADMIN" };
  h.suppressions = { data: [], isLoading: false, isError: false, refetch: vi.fn() };
});

describe("Sistem — zamanlanmış işler (arayüz testi D-139)", () => {
  it("bilinen işler Türkçe ad ve zamanlamayla; ham enum/İngilizce metin yok; bilinmeyen iş API metniyle", () => {
    render(<AdminSistemPage />);
    expect(screen.getByText("Süresi biten paket üyelikleri Standart'a düşür")).toBeInTheDocument();
    expect(screen.getByText("Eski profil/ürün görüntülenme kayıtlarını sil")).toBeInTheDocument();
    expect(screen.getByText("Her gece 04:20 (İstanbul)")).toBeInTheDocument();
    expect(screen.queryByText(/STANDARD/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Deletes profile/)).not.toBeInTheDocument();
    expect(screen.queryByText(/nightly/)).not.toBeInTheDocument();
    expect(screen.getByText("Yeni iş")).toBeInTheDocument();
    expect(screen.getByText("Başarılı")).toBeInTheDocument();
  });

  it("kur notu satış ilanından söz etmez; manuel kur yer tutucusu güncel kur", () => {
    render(<AdminSistemPage />);
    expect(screen.queryByText(/döviz ilanlarında/)).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText("49.0184")).toBeInTheDocument();
  });
});

describe("Sistem — engellenen adresler (arayüz testi D-221)", () => {
  it("API hatasında 'Engellenen adres yok' demez; hata durumu ve Tekrar dene", async () => {
    const refetch = vi.fn();
    h.suppressions = { data: undefined, isLoading: false, isError: true, refetch };
    render(<AdminSistemPage />);
    expect(screen.queryByText("Engellenen adres yok")).not.toBeInTheDocument();
    expect(screen.getByText("Engellenen adresler yüklenemedi")).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Tekrar dene" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("Engeli Kaldır önce onay ister; onaylanınca o adres için tek istek", async () => {
    h.suppressions = {
      data: [{ email: "x@firma.com", status: "BOUNCED", reason: "mailbox", at: "2026-09-01T00:00:00.000Z" }],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    };
    const uev = userEvent.setup();
    render(<AdminSistemPage />);
    await uev.click(screen.getByRole("button", { name: "Engeli Kaldır" }));
    expect(h.clearMutateAsync).not.toHaveBeenCalled();
    const dialog = await screen.findByRole("dialog");
    await uev.click(within(dialog).getByRole("button", { name: "Engeli Kaldır" }));
    expect(h.clearMutateAsync).toHaveBeenCalledTimes(1);
    expect(h.clearMutateAsync).toHaveBeenCalledWith({ email: "x@firma.com" });
  });

  it("SALES listeyi görür ama Engeli Kaldır düğmesi yok", () => {
    h.admin = { role: "SALES" };
    h.suppressions = {
      data: [{ email: "x@firma.com", status: "BOUNCED", reason: null, at: "2026-09-01T00:00:00.000Z" }],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    };
    render(<AdminSistemPage />);
    expect(screen.getByText("x@firma.com")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Engeli Kaldır" })).not.toBeInTheDocument();
  });
});
