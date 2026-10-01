// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  tierMutate: vi.fn((_v: unknown) => Promise.resolve()),
  extendMutate: vi.fn((_v: unknown) =>
    Promise.resolve({ ok: true, membershipEndAt: "2027-01-01T00:00:00.000Z" }),
  ),
  history: { data: [] as unknown[], isLoading: false },
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("sonner", () => ({ toast: h.toast }));
// F7 rol kapısı: butonlar canAdminDo(role) ardında — SUPER_ADMIN mock'u
// olmadan hiç render olmuyor (bu mock eksik kaldığı için suite kırılmıştı).
vi.mock("@/hooks/use-admin-auth", () => ({
  useAdminAuth: () => ({ admin: { role: "SUPER_ADMIN" } }),
}));
vi.mock("@/hooks/use-admin-companies", () => ({
  useSetCompanyTier: () => ({ mutateAsync: h.tierMutate, isPending: false }),
  useExtendMembership: () => ({ mutateAsync: h.extendMutate, isPending: false }),
  useMembershipHistory: () => h.history,
}));

import { MembershipTab } from "../membership-tab";
import type { AdminCompanyDetail } from "@/hooks/use-admin-companies";

function paketDetail(over: Partial<AdminCompanyDetail> = {}): AdminCompanyDetail {
  const end = new Date(Date.now() + 90 * 86_400_000).toISOString();
  return {
    id: "c1",
    tier: "GOLD",
    membershipEndAt: end,
    companyVerificationStatus: "VERIFIED",
    ...over,
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
    expect(h.extendMutate).toHaveBeenCalledWith({
      id: "c1",
      months: 6,
      reason: "yenileme satışı",
    });
  });

  it("geçersiz ay (0) → alan hatası, Uzat kapalı, mutate çağrılmaz", async () => {
    const user = userEvent.setup();
    render(<MembershipTab companyId="c1" data={paketDetail()} />);
    await user.click(screen.getByRole("button", { name: "Süre Uzat" }));
    const dialog = await screen.findByRole("dialog");
    const months = within(dialog).getByLabelText(/Ay sayısı/);
    await user.clear(months);
    await user.type(months, "0");
    expect(within(dialog).getByText(/Ay 1-60 arası/)).toBeInTheDocument();
    const btn = within(dialog).getByRole("button", { name: "Uzat" });
    expect(btn).toBeDisabled();
    await user.click(btn);
    expect(h.extendMutate).not.toHaveBeenCalled();
  });

  it("Paketi Kaldır → gerekçeyle STANDART mutate", async () => {
    const user = userEvent.setup();
    render(<MembershipTab companyId="c1" data={paketDetail()} />);
    await user.click(screen.getByRole("button", { name: "Paketi Kaldır" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText(/Gerekçe/), "iade");
    await user.click(within(dialog).getByRole("button", { name: "Kaldır" }));
    expect(h.tierMutate).toHaveBeenCalledWith({
      id: "c1",
      tier: "STANDART",
      reason: "iade",
    });
  });

  it("Paketi Kaldır: sonuç uyarısı + gerekçe 500 karakter sınırı; hata dalında diyalog açık, gerekçe korunur (D-202)", async () => {
    h.tierMutate.mockImplementationOnce(() => Promise.reject(new Error("400")));
    const user = userEvent.setup();
    render(<MembershipTab companyId="c1" data={paketDetail()} />);
    await user.click(screen.getByRole("button", { name: "Paketi Kaldır" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("note")).toHaveTextContent(/Kalan süre/);
    const input = within(dialog).getByLabelText(/Gerekçe/);
    expect(input).toHaveAttribute("maxLength", "500");
    await user.type(input, "iade");
    await user.click(within(dialog).getByRole("button", { name: "Kaldır" }));
    await vi.waitFor(() => expect(h.tierMutate).toHaveBeenCalled());
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(within(screen.getByRole("dialog")).getByLabelText(/Gerekçe/)).toHaveValue("iade");
  });

  it("süresiz pakette Süre Uzat görünmez, açıklama gösterilir (D-203)", () => {
    render(
      <MembershipTab
        companyId="c1"
        data={paketDetail({ tier: "SILVER", membershipEndAt: null })}
      />,
    );
    expect(screen.queryByRole("button", { name: "Süre Uzat" })).not.toBeInTheDocument();
    expect(screen.getByText(/süresiz/)).toBeInTheDocument();
  });

  it("Gold → Silver düşürme ve doğrulanmamış firmaya paket: uyarı notu (D-191)", async () => {
    const user = userEvent.setup();
    render(
      <MembershipTab
        companyId="c1"
        data={paketDetail({ companyVerificationStatus: "UNVERIFIED" })}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Yeni Dönem Başlat" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("note")).toHaveTextContent(/doğrulanmamış/);
    expect(within(dialog).getByRole("note")).not.toHaveTextContent(/düşürülüyor/);
    await user.selectOptions(within(dialog).getByLabelText("Paket"), "SILVER");
    expect(within(dialog).getByRole("note")).toHaveTextContent(/Gold → Silver/);
  });

  it("KVKK ile anonimleştirilmiş firmada paket işlemi yok (D-208)", () => {
    render(
      <MembershipTab
        companyId="c1"
        data={paketDetail({ tier: "STANDART", membershipEndAt: null, anonymized: true })}
      />,
    );
    expect(screen.queryByRole("button", { name: "Paket Tanımla" })).not.toBeInTheDocument();
    expect(screen.getByText(/anonimleştirildi/)).toBeInTheDocument();
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
