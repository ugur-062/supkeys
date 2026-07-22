// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  tierMutate: vi.fn(),
  extendMutate: vi.fn(),
  history: { data: [] as unknown[], isLoading: false },
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("sonner", () => ({ toast: h.toast }));
vi.mock("@/hooks/use-admin-companies", () => ({
  useSetCompanyTier: () => ({ mutate: h.tierMutate, isPending: false }),
  useExtendMembership: () => ({ mutate: h.extendMutate, isPending: false }),
  useMembershipHistory: () => h.history,
}));

import { MembershipTab } from "../membership-tab";
import type { AdminCompanyDetail } from "@/hooks/use-admin-companies";

function paketDetail(): AdminCompanyDetail {
  const end = new Date(Date.now() + 90 * 86_400_000).toISOString();
  return {
    id: "c1",
    tier: "GOLD",
    membershipEndAt: end,
  } as AdminCompanyDetail;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.history = { data: [], isLoading: false };
});

describe("MembershipTab — üyelik yönetimi", () => {
  it("Süre Uzat → ay+gerekçe dialog'u → extend mutate (ek-süreli)", async () => {
    const user = userEvent.setup();
    render(<MembershipTab companyId="c1" data={paketDetail()} />);
    await user.click(screen.getByRole("button", { name: "Süre Uzat" }));
    const dialog = await screen.findByRole("dialog");
    const months = within(dialog).getByLabelText(/Ay sayısı/);
    await user.clear(months);
    await user.type(months, "6");
    await user.type(
      within(dialog).getByLabelText(/Gerekçe/),
      "yenileme satışı",
    );
    await user.click(within(dialog).getByRole("button", { name: "Uzat" }));
    expect(h.extendMutate).toHaveBeenCalledWith(
      { id: "c1", months: 6, reason: "yenileme satışı" },
      expect.anything(),
    );
  });

  it("geçersiz ay (0) → hata toast, mutate çağrılmaz", async () => {
    const user = userEvent.setup();
    render(<MembershipTab companyId="c1" data={paketDetail()} />);
    await user.click(screen.getByRole("button", { name: "Süre Uzat" }));
    const dialog = await screen.findByRole("dialog");
    const months = within(dialog).getByLabelText(/Ay sayısı/);
    await user.clear(months);
    await user.type(months, "0");
    await user.click(within(dialog).getByRole("button", { name: "Uzat" }));
    expect(h.toast.error).toHaveBeenCalled();
    expect(h.extendMutate).not.toHaveBeenCalled();
  });

  it("Premium'u Kaldır → gerekçeyle STANDARD mutate", async () => {
    const user = userEvent.setup();
    render(<MembershipTab companyId="c1" data={paketDetail()} />);
    await user.click(
      screen.getByRole("button", { name: "Premium'u Kaldır" }),
    );
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText(/Gerekçe/), "iade");
    await user.click(within(dialog).getByRole("button", { name: "Kaldır" }));
    expect(h.tierMutate).toHaveBeenCalledWith(
      { id: "c1", tier: "STANDART", reason: "iade" },
      expect.anything(),
    );
  });

  it("geçmiş tablosu event'leri gösterir (sistem = adminEmail null)", () => {
    h.history = {
      data: [
        {
          id: "e1",
          action: "EXTEND",
          months: 6,
          endBefore: null,
          endAfter: "2026-12-01T00:00:00.000Z",
          reason: "yenileme",
          adminEmail: "sales@rothern.com",
          createdAt: "2026-07-01T10:00:00.000Z",
        },
        {
          id: "e2",
          action: "EXPIRE",
          months: null,
          endBefore: "2026-06-01T00:00:00.000Z",
          endAfter: null,
          reason: "Süre doldu (otomatik)",
          adminEmail: null,
          createdAt: "2026-06-01T03:00:00.000Z",
        },
      ],
      isLoading: false,
    };
    render(<MembershipTab companyId="c1" data={paketDetail()} />);
    expect(screen.getByText("Uzatıldı")).toBeInTheDocument();
    expect(screen.getByText("Süre doldu")).toBeInTheDocument();
    expect(screen.getByText("sales@rothern.com")).toBeInTheDocument();
    expect(screen.getByText("sistem")).toBeInTheDocument();
  });
});
