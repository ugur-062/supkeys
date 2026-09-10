// @vitest-environment jsdom
/**
 * Bağlantılar yeniden tasarımı (2026-09-10): Keşfet ve sekme YOK; başlıkta
 * "Firma bul" (portalın dizini) + "Davet et" (Silver+ ∧ izin); gelen istekler
 * en üstte yalnız varsa; Bağlantılarım tek liste + arama; Bekleyenler katlanır;
 * izinsiz üye salt-okunur.
 */
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  tier: "GOLD",
  perm: true,
  connections: [] as unknown[],
  incoming: [] as unknown[],
  outgoing: [] as unknown[],
  referrals: [] as unknown[],
  respond: vi.fn(),
  invite: vi.fn(),
  batch: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("sonner", () => ({ toast: h.toast }));
vi.mock("@/hooks/use-company-auth", () => ({
  useCompanyAuth: () => ({ company: { tier: h.tier } }),
  useHasCompanyPermission: () => h.perm,
}));
vi.mock("@/hooks/use-company-complaints", () => ({
  useFileComplaint: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@/components/providers/confirm-dialog", () => ({ useConfirm: () => async () => true }));
vi.mock("@/hooks/use-company-connections", () => ({
  useConnectionSelf: () => ({ data: { rothernId: "AAAA-0001" } }),
  useConnections: () => ({ data: h.connections, isLoading: false }),
  useIncomingInvites: () => ({ data: h.incoming, isLoading: false }),
  useOutgoingInvites: () => ({ data: h.outgoing, isLoading: false }),
  useReferralInvites: () => ({ data: h.referrals }),
  useRespondInvite: () => ({ mutateAsync: h.respond, isPending: false, variables: undefined }),
  useCancelReferralInvite: () => ({ mutateAsync: vi.fn(), isPending: false, variables: undefined }),
  useDisconnect: () => ({ mutateAsync: vi.fn(), isPending: false, variables: undefined }),
  useBlockCompany: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useInviteByEmail: () => ({ mutateAsync: h.invite, isPending: false }),
  useInviteByEmailBatch: () => ({ mutateAsync: h.batch, isPending: false }),
}));

import { ConnectionsView } from "../connections-view";

const co = (i: number, over: Record<string, unknown> = {}) => ({
  id: `c${i}`,
  name: `Firma ${i}`,
  rothernId: `BBBB-000${i}`,
  city: "Bursa",
  industry: "Elektrik",
  logoUrl: null,
  verified: i % 2 === 0,
  activities: ["MANUFACTURER"],
  productPreview: { thumbnails: [], total: 3 },
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  h.tier = "GOLD";
  h.perm = true;
  h.connections = [
    { connectionId: "k1", origin: "INVITE", company: co(1), decidedAt: null },
    { connectionId: "k2", origin: "PREMIUM", company: co(2), decidedAt: null },
  ];
  h.incoming = [];
  h.outgoing = [];
  h.referrals = [];
  h.invite.mockResolvedValue({ kind: "invited", email: "x@y.com" });
});

describe("ConnectionsView", () => {
  it("Keşfet ve sekme YOK; Firma bul portalın dizinine; Davet et var; Rothern ID sessiz satır", () => {
    render(<ConnectionsView portal="satis" />);
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.queryByText("Keşfet")).toBeNull();
    expect(screen.getByRole("link", { name: /Firma bul/ })).toHaveAttribute("href", "/company/satis/firmalar");
    expect(screen.getByRole("button", { name: /Davet et/ })).toBeInTheDocument();
    expect(screen.getByText("AAAA-0001")).toBeInTheDocument();
    // Liste satırları + Mesaj bağlantısı portalı taşır; köken rozeti yok.
    expect(screen.getByText("Firma 1")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /Mesaj/ })[0]).toHaveAttribute("href", "/company/mesajlar?with=c1&portal=satis");
    expect(screen.queryByText("Referans")).toBeNull();
    expect(screen.queryByText("Profili gör")).toBeNull();
  });

  it("gelen istek varsa EN ÜSTTE, Kabul/Reddet; yoksa bölüm çizilmez", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<ConnectionsView />);
    expect(screen.queryByRole("heading", { name: /Gelen istekler/ })).toBeNull();
    unmount();
    h.incoming = [{ connectionId: "g1", company: co(9), createdAt: "2026-09-10T00:00:00Z" }];
    render(<ConnectionsView />);
    const sec = screen.getByRole("heading", { name: /Gelen istekler/ }).closest("section")!;
    const main = screen.getByRole("heading", { name: /Bağlantılarım/ }).closest("section")!;
    expect(sec.compareDocumentPosition(main) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await user.click(within(sec).getByRole("button", { name: "Kabul et" }));
    expect(h.respond).toHaveBeenCalledWith({ connectionId: "g1", action: "accept" });
  });

  it("Bekleyenler katlanır bölüm: giden istek + e-posta daveti sayısıyla", () => {
    h.outgoing = [{ connectionId: "o1", company: co(5), createdAt: "" }];
    h.referrals = [{ id: "r1", email: "yeni@firma.com", createdAt: "" }];
    render(<ConnectionsView />);
    const details = screen.getByText("Bekleyenler").closest("details")!;
    expect(within(details).getByText("2")).toBeInTheDocument();
    expect(within(details).getByText("yeni@firma.com")).toBeInTheDocument();
    expect(within(details).getByRole("button", { name: "Geri çek" })).toBeInTheDocument();
  });

  it("arama bağlantıları süzer", async () => {
    const user = userEvent.setup();
    render(<ConnectionsView />);
    await user.type(screen.getByLabelText("Bağlantılarımda ara"), "Firma 2");
    expect(screen.queryByText("Firma 1")).toBeNull();
    expect(screen.getByText("Firma 2")).toBeInTheDocument();
  });

  it("STANDART ya da izinsiz: Davet et yok, satır menüsü yok, liste görünür", () => {
    h.tier = "STANDART";
    const { unmount } = render(<ConnectionsView />);
    expect(screen.queryByRole("button", { name: /Davet et/ })).toBeNull();
    unmount();
    h.perm = false;
    render(<ConnectionsView />);
    expect(screen.queryByRole("button", { name: "Daha fazla" })).toBeNull();
    expect(screen.getAllByText("Firma 1").length).toBeGreaterThan(0);
  });

  it("Davet et: tek adres → tekil uç, çok adres → toplu uç", async () => {
    const user = userEvent.setup();
    h.batch.mockResolvedValue({ summary: { request: 1, invited: 1, skipped: 0 }, results: [] });
    render(<ConnectionsView />);
    await user.click(screen.getByRole("button", { name: /Davet et/ }));
    const box = await screen.findByLabelText("Davet edilecek e-posta adresleri");
    await user.type(box, "x@y.com");
    await user.click(screen.getByRole("button", { name: "Davet gönder" }));
    expect(h.invite).toHaveBeenCalledWith("x@y.com");
    await user.click(screen.getByRole("button", { name: /Davet et/ }));
    const box2 = await screen.findByLabelText("Davet edilecek e-posta adresleri");
    await user.type(box2, "a@b.com, c@d.com");
    await user.click(screen.getByRole("button", { name: "2 adrese davet gönder" }));
    expect(h.batch).toHaveBeenCalledWith(["a@b.com", "c@d.com"]);
  });
});
