// @vitest-environment jsdom
/**
 * Bağlantılar yeniden tasarımı (2026-09-10, dördüncü tur — TABLO): Keşfet,
 * sekme ve ray YOK; başlıkta "Firma bul" + "Davet et"; arama üstte, altında
 * görünüm çipleri (Bağlantılarım · Gelen istekler · Bekleyenler, sayılı),
 * altında dense tablo; 50'şer çizim; izinsiz üye salt-okunur.
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
  it("Keşfet/sekme/ray YOK; Firma bul portalın dizinine; Davet et; Rothern ID başlıkta; tablo + Mesaj", () => {
    render(<ConnectionsView portal="satis" />);
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.queryByText("Keşfet")).toBeNull();
    expect(document.querySelector("aside")).toBeNull();
    expect(screen.getByRole("link", { name: /Firma bul/ })).toHaveAttribute("href", "/company/satis/firmalar");
    expect(screen.getByRole("button", { name: /Davet et/ })).toBeInTheDocument();
    expect(screen.getByText("AAAA-0001")).toBeInTheDocument();
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByText("Firma 1")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /Mesaj/ })[0]).toHaveAttribute("href", "/company/mesajlar?with=c1&portal=satis");
    expect(screen.queryByText("Referans")).toBeNull();
    expect(screen.queryByText("Profili gör")).toBeNull();
  });

  it("arama kutusu ÜSTTE, altında görünüm çipleri sayılı (gelen istek amber), altında tablo", () => {
    h.incoming = [{ connectionId: "g1", company: co(9), createdAt: "" }];
    h.outgoing = [{ connectionId: "o1", company: co(5), createdAt: "" }];
    h.referrals = [{ id: "r1", email: "yeni@firma.com", createdAt: "" }];
    render(<ConnectionsView />);
    const search = screen.getByLabelText("Bağlantılarımda ara");
    const chips = screen.getByRole("group", { name: "Görünüm" });
    const table = screen.getByRole("table");
    expect(search.compareDocumentPosition(chips) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(chips.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(chips).getByRole("button", { name: /Bağlantılarım/ })).toHaveTextContent("2");
    expect(within(chips).getByRole("button", { name: /Gelen istekler/ })).toHaveTextContent("1");
    expect(within(chips).getByRole("button", { name: /Bekleyenler/ })).toHaveTextContent("2");
    expect(within(chips).getByRole("button", { name: /Bağlantılarım/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("Gelen istekler çipi: satırda Kabul et / Reddet; Bekleyenler: Geri çek + İptal et", async () => {
    const user = userEvent.setup();
    h.incoming = [{ connectionId: "g1", company: co(9), createdAt: "" }];
    h.outgoing = [{ connectionId: "o1", company: co(5), createdAt: "" }];
    h.referrals = [{ id: "r1", email: "yeni@firma.com", createdAt: "" }];
    render(<ConnectionsView />);
    await user.click(screen.getByRole("button", { name: /Gelen istekler/ }));
    expect(screen.getByText("Firma 9")).toBeInTheDocument();
    expect(screen.queryByText("Firma 1")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Kabul et" }));
    expect(h.respond).toHaveBeenCalledWith({ connectionId: "g1", action: "accept" });
    await user.click(screen.getByRole("button", { name: /Bekleyenler/ }));
    expect(screen.getByText("Firma 5")).toBeInTheDocument();
    expect(screen.getByText("yeni@firma.com")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Geri çek" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "İptal et" })).toBeInTheDocument();
  });

  it("100+ bağlantı: 50'şer gösterir, 'Daha fazla göster' ile açılır", async () => {
    const user = userEvent.setup();
    h.connections = Array.from({ length: 120 }, (_, i) => ({
      connectionId: `k${i}`, origin: "INVITE", company: co(i), decidedAt: null,
    }));
    render(<ConnectionsView />);
    expect(screen.getAllByRole("link", { name: /Mesaj/ })).toHaveLength(50);
    expect(screen.getByText("50 / 120 gösteriliyor")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Daha fazla göster" }));
    expect(screen.getAllByRole("link", { name: /Mesaj/ })).toHaveLength(100);
  });

  it("arama bağlantıları süzer (ve Bağlantılarım görünümüne döner)", async () => {
    const user = userEvent.setup();
    render(<ConnectionsView />);
    await user.click(screen.getByRole("button", { name: /Bekleyenler/ }));
    await user.type(screen.getByLabelText("Bağlantılarımda ara"), "Firma 2");
    expect(screen.queryByText("Firma 1")).toBeNull();
    expect(screen.getByText("Firma 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Bağlantılarım/ })).toHaveAttribute("aria-pressed", "true");
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
