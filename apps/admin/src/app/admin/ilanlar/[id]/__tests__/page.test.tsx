// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toDateTimeLocal } from "@/lib/date";

/**
 * Derin denetim LU-12: (a) kapat/uzat/yeniden aç düğmeleri SUPPORT'a da
 * çiziliyordu (API SUPER_ADMIN+SALES, 403); (b) Süre Uzat tarih seçicisinin
 * alt sınırı UTC ISO'dan kesiliyordu (TR'de 3 saat geride).
 */
const h = vi.hoisted(() => ({
  role: "SALES" as string,
  listing: undefined as unknown,
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("next/navigation", () => ({ useParams: () => ({ id: "l1" }) }));
vi.mock("@/components/layout/admin-shell", () => ({
  AdminShell: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/hooks/use-admin-auth", () => ({
  useAdminAuth: () => ({ admin: { role: h.role } }),
}));
vi.mock("@/hooks/use-admin-inspection", () => ({
  useAdminListingDetail: () => ({ data: h.listing, isLoading: false, isError: false, refetch: vi.fn() }),
  useListingIntervention: () => ({ mutate: vi.fn(), isPending: false }),
}));

import AdminListingPage from "../page";

const CLOSES_AT = "2026-10-01T15:00:00.000Z";

function listing(over: Record<string, unknown> = {}) {
  return {
    id: "l1",
    number: "ROT-000001",
    title: "Çelik boru",
    type: "ALIM",
    format: null,
    status: "OPEN",
    visibility: "PUBLIC",
    closesAt: CLOSES_AT,
    cancelReason: null,
    primaryCurrency: "TRY",
    isSealedBid: true,
    awardedAt: null,
    createdAt: "2026-09-20T10:00:00.000Z",
    company: { id: "c1", name: "Acme", rothernId: null },
    items: [],
    invitations: [],
    bids: [],
    orders: [],
    ...over,
  };
}

beforeEach(() => {
  h.role = "SALES";
  h.listing = listing();
});

describe("/admin/ilanlar/[id] — müdahale düğmeleri", () => {
  it("SALES açık ilanda Süre Uzat / İlanı Kapat görür", () => {
    render(<AdminListingPage />);
    expect(screen.getByRole("button", { name: "Süre Uzat" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "İlanı Kapat" })).toBeInTheDocument();
  });

  it("SUPPORT müdahale düğmelerini görmez", () => {
    h.role = "SUPPORT";
    render(<AdminListingPage />);
    expect(screen.queryByRole("button", { name: "Süre Uzat" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "İlanı Kapat" })).not.toBeInTheDocument();
  });

  it("SUPPORT kapalı ilanda Yeniden Aç görmez", () => {
    h.role = "SUPPORT";
    h.listing = listing({ status: "CLOSED" });
    render(<AdminListingPage />);
    expect(screen.queryByRole("button", { name: "Yeniden Aç" })).not.toBeInTheDocument();
  });

  it("Süre Uzat alt sınırı kapanışın YEREL saatidir (UTC kesilmez)", async () => {
    const user = userEvent.setup();
    render(<AdminListingPage />);
    await user.click(screen.getByRole("button", { name: "Süre Uzat" }));
    const input = await screen.findByLabelText(/Yeni kapanış/);
    expect(input).toHaveAttribute("min", toDateTimeLocal(CLOSES_AT));
  });
});
