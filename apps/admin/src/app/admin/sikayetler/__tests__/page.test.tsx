// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  complaints: {
    data: undefined as unknown,
    isLoading: false,
    isError: false,
  },
  resolveMutate: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("sonner", () => ({ toast: h.toast }));
vi.mock("@/components/layout/admin-shell", () => ({
  AdminShell: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/hooks/use-admin-companies", () => ({
  useAdminComplaints: () => h.complaints,
  useResolveComplaint: () => ({ mutate: h.resolveMutate, isPending: false }),
}));

import AdminSikayetlerPage from "../page";

function complaint(overrides: Record<string, unknown> = {}) {
  return {
    id: "k1",
    complainant: { id: "c1", name: "Şikayetçi A.Ş.", rothernId: "SK-001" },
    against: { id: "c2", name: "Hakkında Ltd.", rothernId: "SK-002" },
    reason: "Teslimat gecikmesi",
    detail: "Sipariş 30 gün geç geldi.",
    status: "OPEN",
    adminNote: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    resolvedAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.complaints = { data: { items: [complaint()], total: 1, page: 1, pageSize: 25 }, isLoading: false, isError: false };
});

describe("SikayetlerView — durum tablosu", () => {
  it("isError → 'Veri alınamadı' gösterir", () => {
    h.complaints = { data: undefined, isLoading: false, isError: true };
    render(<AdminSikayetlerPage />);
    expect(screen.getByText(/Veri alınamadı/)).toBeInTheDocument();
  });

  it("isLoading → 'Yükleniyor...' gösterir", () => {
    h.complaints = { data: undefined, isLoading: true, isError: false };
    render(<AdminSikayetlerPage />);
    expect(screen.getByText("Yükleniyor...")).toBeInTheDocument();
  });

  it("boş veri → 'Şikayet bulunamadı' gösterir", () => {
    h.complaints = { data: { items: [], total: 0, page: 1, pageSize: 25 }, isLoading: false, isError: false };
    render(<AdminSikayetlerPage />);
    expect(screen.getByText("Şikayet bulunamadı")).toBeInTheDocument();
  });

  it("satır render eder", () => {
    render(<AdminSikayetlerPage />);
    expect(screen.getByText("Hakkında Ltd.")).toBeInTheDocument();
  });
});

describe("SikayetlerView — çözüm aksiyonları (PromptDialog)", () => {
  it("Çöz → dialog açılır (yönetici notu) → RESOLVED + suspend=false ile mutate", async () => {
    const user = userEvent.setup();
    render(<AdminSikayetlerPage />);
    await user.click(screen.getByRole("button", { name: "Çöz" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Şikayeti Çöz")).toBeInTheDocument();
    const input = screen.getByLabelText(/Yönetici notu/);
    await user.type(input, "haklı bulundu");
    await user.click(within(dialog).getByRole("button", { name: "Çöz" }));
    expect(h.resolveMutate).toHaveBeenCalledWith(
      {
        id: "k1",
        status: "RESOLVED",
        adminNote: "haklı bulundu",
        suspend: false,
      },
      expect.anything(),
    );
  });

  it("Reddet → DISMISSED + suspend=false ile mutate", async () => {
    const user = userEvent.setup();
    render(<AdminSikayetlerPage />);
    await user.click(screen.getByRole("button", { name: "Reddet" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Şikayeti Reddet")).toBeInTheDocument();
    const input = screen.getByLabelText(/Yönetici notu/);
    await user.type(input, "asılsız");
    await user.click(within(dialog).getByRole("button", { name: "Reddet" }));
    expect(h.resolveMutate).toHaveBeenCalledWith(
      { id: "k1", status: "DISMISSED", adminNote: "asılsız", suspend: false },
      expect.anything(),
    );
  });

  it("Çöz & Askıya Al → RESOLVED + suspend=true; boş not → adminNote=undefined", async () => {
    const user = userEvent.setup();
    render(<AdminSikayetlerPage />);
    await user.click(screen.getByRole("button", { name: "Çöz & Askıya Al" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(
      within(dialog).getByRole("button", { name: "Çöz & Askıya Al" }),
    );
    expect(h.resolveMutate).toHaveBeenCalledWith(
      {
        id: "k1",
        status: "RESOLVED",
        adminNote: undefined,
        suspend: true,
      },
      expect.anything(),
    );
  });
});
