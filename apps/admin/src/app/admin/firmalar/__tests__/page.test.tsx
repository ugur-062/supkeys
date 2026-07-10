// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  companies: { data: undefined as unknown, isLoading: false, isError: false },
  stats: { data: undefined as unknown, isLoading: false },
  actMutate: vi.fn(),
  tierMutate: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
  replace: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: h.toast }));
vi.mock("@/components/layout/admin-shell", () => ({
  AdminShell: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: h.replace, push: vi.fn() }),
  usePathname: () => "/admin/firmalar",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/hooks/use-admin-companies", () => ({
  useAdminCompanies: () => h.companies,
  useAdminCompanyStats: () => h.stats,
  useCompanyAction: () => ({ mutate: h.actMutate, isPending: false }),
  useSetCompanyTier: () => ({ mutate: h.tierMutate, isPending: false }),
}));

import AdminFirmalarPage from "../page";

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "c1",
    rothernId: "SK-001",
    name: "Acme A.Ş.",
    taxNumber: "1234567890",
    country: "TR",
    stateRegion: null,
    city: "İstanbul",
    tier: "STANDARD",
    membershipEndAt: null,
    verification: "PENDING",
    isBlocked: false,
    complaintCount: 0,
    userCount: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function paged(items: unknown[]) {
  return { items, total: items.length, page: 1, pageSize: 25 };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.companies = { data: paged([row()]), isLoading: false, isError: false };
  h.stats = {
    data: {
      countryBreakdown: [{ country: "TR", count: 1 }],
    },
    isLoading: false,
  };
});

describe("FirmalarView — durum tablosu", () => {
  it("isError → 'Veri alınamadı' gösterir", () => {
    h.companies = { data: undefined, isLoading: false, isError: true };
    render(<AdminFirmalarPage />);
    expect(screen.getByText(/Veri alınamadı/)).toBeInTheDocument();
  });

  it("isLoading → 'Yükleniyor...' gösterir", () => {
    h.companies = { data: undefined, isLoading: true, isError: false };
    render(<AdminFirmalarPage />);
    expect(screen.getByText("Yükleniyor...")).toBeInTheDocument();
  });

  it("boş veri → 'Firma bulunamadı' gösterir", () => {
    h.companies = { data: paged([]), isLoading: false, isError: false };
    render(<AdminFirmalarPage />);
    expect(screen.getByText("Firma bulunamadı")).toBeInTheDocument();
  });

  it("satır render eder — ülke ve üyelik bitişi dahil", () => {
    const end = new Date("2026-06-01T00:00:00Z").toISOString();
    h.companies = {
      data: paged([row({ tier: "PAKET", membershipEndAt: end })]),
      isLoading: false,
      isError: false,
    };
    render(<AdminFirmalarPage />);
    expect(screen.getByText("Acme A.Ş.")).toBeInTheDocument();
    // Ülke hücresi: bayrak + kod
    expect(screen.getByText(/TR/)).toBeInTheDocument();
    // Premium rozet + bitiş tarihi ("Premium" ayrıca üyelik filtresi
    // option'ında da geçer → getAllBy).
    expect(screen.getAllByText("Premium").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/1 Haz 26/)).toBeInTheDocument();
  });

  it("İncele → firma detay sayfasına link verir", () => {
    render(<AdminFirmalarPage />);
    const link = screen.getByRole("link", { name: "İncele" });
    expect(link).toHaveAttribute("href", "/admin/firmalar/c1");
  });

  it("sayfalama toplam kayıt bilgisini gösterir", () => {
    render(<AdminFirmalarPage />);
    expect(screen.getByText(/1 kayıt içinden 1-1 arası/)).toBeInTheDocument();
  });
});

describe("FirmalarView — PAKET (tier) verme", () => {
  it("PAKET Ver → PromptDialog açılır (başlık 'Premium (PAKET) Ver')", async () => {
    const user = userEvent.setup();
    render(<AdminFirmalarPage />);
    await user.click(screen.getByRole("button", { name: "PAKET Ver" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Premium (PAKET) Ver")).toBeInTheDocument();
  });

  it("ay '6' girilip onaylanınca months=6 ile tier mutate", async () => {
    const user = userEvent.setup();
    render(<AdminFirmalarPage />);
    await user.click(screen.getByRole("button", { name: "PAKET Ver" }));
    const dialog = await screen.findByRole("dialog");
    const input = screen.getByLabelText(/Kaç ay premium verilsin/);
    await user.clear(input);
    await user.type(input, "6");
    await user.click(within(dialog).getByRole("button", { name: "PAKET Ver" }));
    expect(h.tierMutate).toHaveBeenCalledWith(
      { id: "c1", tier: "PAKET", months: 6 },
      expect.anything(),
    );
  });

  it("varsayılan (12) korunursa months=12 ile mutate", async () => {
    const user = userEvent.setup();
    render(<AdminFirmalarPage />);
    await user.click(screen.getByRole("button", { name: "PAKET Ver" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "PAKET Ver" }));
    expect(h.tierMutate).toHaveBeenCalledWith(
      { id: "c1", tier: "PAKET", months: 12 },
      expect.anything(),
    );
  });

  it("geçersiz (n<1) → Number coercion fix ile months=12'ye düşer", async () => {
    const user = userEvent.setup();
    render(<AdminFirmalarPage />);
    await user.click(screen.getByRole("button", { name: "PAKET Ver" }));
    const dialog = await screen.findByRole("dialog");
    const input = screen.getByLabelText(/Kaç ay premium verilsin/);
    await user.clear(input);
    await user.type(input, "0");
    await user.click(within(dialog).getByRole("button", { name: "PAKET Ver" }));
    expect(h.tierMutate).toHaveBeenCalledWith(
      { id: "c1", tier: "PAKET", months: 12 },
      expect.anything(),
    );
  });
});

describe("FirmalarView — askıya alma", () => {
  it("Askıya Al → PromptDialog 'Firmayı Askıya Al' açılır", async () => {
    const user = userEvent.setup();
    render(<AdminFirmalarPage />);
    await user.click(screen.getByRole("button", { name: "Askıya Al" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Firmayı Askıya Al")).toBeInTheDocument();
  });

  it("sebep girilip onaylanınca suspend action'ı reason ile mutate", async () => {
    const user = userEvent.setup();
    render(<AdminFirmalarPage />);
    await user.click(screen.getByRole("button", { name: "Askıya Al" }));
    const dialog = await screen.findByRole("dialog");
    const input = screen.getByLabelText(/Askı sebebi/);
    await user.type(input, "tekrarlı şikayet");
    await user.click(within(dialog).getByRole("button", { name: "Askıya Al" }));
    expect(h.actMutate).toHaveBeenCalledWith(
      { id: "c1", action: "suspend", reason: "tekrarlı şikayet" },
      expect.anything(),
    );
  });
});
