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
  blocks: [] as unknown[],
  search: "",
  confirm: vi.fn(),
  unblock: vi.fn(),
  disconnect: vi.fn(),
  cancelReferral: vi.fn(),
  respond: vi.fn(),
  invite: vi.fn(),
  batch: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

vi.mock("sonner", () => ({ toast: h.toast }));
vi.mock("@/hooks/use-company-auth", () => ({
  useCompanyAuth: () => ({ company: { tier: h.tier } }),
  useHasCompanyPermission: () => h.perm,
}));
vi.mock("@/hooks/use-company-complaints", () => ({
  useFileComplaint: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@/components/providers/confirm-dialog", () => ({ useConfirm: () => h.confirm }));
vi.mock("next/navigation", async (orig) => ({
  ...(await orig<typeof import("next/navigation")>()),
  useSearchParams: () => new URLSearchParams(h.search),
}));
vi.mock("@/hooks/use-company-connections", () => ({
  useConnectionSelf: () => ({ data: { rothernId: "AAAA-0001" } }),
  useConnections: () => ({ data: h.connections, isLoading: false }),
  useIncomingInvites: () => ({ data: h.incoming, isLoading: false }),
  useOutgoingInvites: () => ({ data: h.outgoing, isLoading: false }),
  useReferralInvites: () => ({ data: h.referrals }),
  useRespondInvite: () => ({ mutateAsync: h.respond, isPending: false, variables: undefined }),
  useCancelReferralInvite: () => ({ mutateAsync: h.cancelReferral, isPending: false, variables: undefined }),
  useDisconnect: () => ({ mutateAsync: h.disconnect, isPending: false, variables: undefined }),
  useBlocks: () => ({ data: h.blocks, isLoading: false }),
  useUnblockCompany: () => ({ mutateAsync: h.unblock, isPending: false, variables: undefined }),
  useBlockCompany: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useInviteByEmail: () => ({ mutateAsync: h.invite, isPending: false }),
  useInviteByEmailBatch: () => ({ mutateAsync: h.batch, isPending: false }),
}));

import { ConnectionsView } from "../connections-view";
import { useCompanyAuthStore } from "@/lib/company-auth/store";

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
  h.blocks = [];
  h.search = "";
  h.confirm.mockResolvedValue(true);
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

  // 60 satır çizip etkileşim yapıyor; paralel koşumda 15 sn tavanını aşıp
  // ÜRÜN HATASI gibi görünüyordu (tek başına hep geçiyor). Sınanan şey
  // sayfalama davranışı, hız değil.
  it("100+ bağlantı: 50'şer gösterir, 'Daha fazla göster' ile açılır", async () => {
    const user = userEvent.setup();
    h.connections = Array.from({ length: 60 }, (_, i) => ({
      connectionId: `k${i}`, origin: "INVITE", company: co(i), decidedAt: null,
    }));
    render(<ConnectionsView />);
    expect(screen.getAllByRole("link", { name: /Mesaj/ })).toHaveLength(50);
    expect(screen.getByText("50 / 60 gösteriliyor")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Daha fazla göster" }));
    expect(screen.getAllByRole("link", { name: /Mesaj/ })).toHaveLength(60);
  }, 30_000);

  it("arama bağlantıları süzer (ve Bağlantılarım görünümüne döner)", async () => {
    const user = userEvent.setup();
    render(<ConnectionsView />);
    await user.click(screen.getByRole("button", { name: /Bekleyenler/ }));
    await user.type(screen.getByLabelText("Bağlantılarımda ara"), "Firma 2");
    expect(screen.queryByText("Firma 1")).toBeNull();
    expect(screen.getByText("Firma 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Bağlantılarım/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("doğrulanmamış firma: Davet et KİLİTLİ düğme (doğrulamaya), boş durum e-posta daveti önermez (O-097); izinsiz: hiç yok", () => {
    h.tier = "STANDART";
    h.connections = [];
    const { unmount, container } = render(<ConnectionsView />);
    expect(screen.queryByRole("button", { name: /Davet et/ })).toBeNull();
    expect(screen.getByRole("link", { name: /Davet için firma doğrulaması gerekir/ })).toHaveAttribute(
      "href",
      "/company/ayarlar/dogrulama",
    );
    expect(screen.queryByText(/e-posta ile davet edin/)).toBeNull();
    expect(screen.getByText(/e-postayla davet etmek firma doğrulamasıyla açılır/)).toBeInTheDocument();
    // Ücretsiz dönem: paket adı ve paket sayfası hiçbir yerde yok.
    expect(container.textContent).not.toMatch(/Silver|Gold|Platinum|paket/i);
    expect(container.querySelector('a[href*="/company/premium"]')).toBeNull();
    unmount();
    h.perm = false;
    h.connections = [{ connectionId: "k1", origin: "INVITE", company: co(1), decidedAt: null }];
    render(<ConnectionsView />);
    expect(screen.queryByRole("link", { name: /Davet için firma doğrulaması gerekir/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Daha fazla" })).toBeNull();
    expect(screen.getAllByText("Firma 1").length).toBeGreaterThan(0);
  });

  it("reddedilmiş doğrulama: kilitli davet yine doğrulamaya gider (webC-2, D-194 kuralı)", () => {
    h.tier = "STANDART";
    h.connections = [];
    useCompanyAuthStore.setState({ company: { companyVerificationStatus: "REJECTED" } as never } as never);
    try {
      const { container } = render(<ConnectionsView />);
      expect(screen.getByRole("link", { name: /Davet için firma doğrulaması gerekir/ })).toHaveAttribute(
        "href",
        "/company/ayarlar/dogrulama",
      );
      expect(container.querySelector('a[href*="/company/premium"]')).toBeNull();
    } finally {
      useCompanyAuthStore.setState({ company: null } as never);
    }
  });

  it("?view=incoming gelen istekler görünümüyle açılır (D-328)", () => {
    h.search = "view=incoming";
    h.incoming = [{ connectionId: "g1", company: co(9), createdAt: "" }];
    render(<ConnectionsView />);
    expect(screen.getByRole("button", { name: /Gelen istekler/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Firma 9")).toBeInTheDocument();
    expect(screen.queryByText("Firma 1")).toBeNull();
  });

  it("Engellenenler görünümü: engelli firma listelenir, profil bağlantısı yok, onaylı 'Engeli kaldır' (Y-05)", async () => {
    const user = userEvent.setup();
    h.blocks = [{ company: { id: "x7", name: "Engelli AŞ", rothernId: "ZZZZ-0007" }, createdAt: "" }];
    h.unblock.mockResolvedValue({ ok: true });
    render(<ConnectionsView />);
    const chip = screen.getByRole("button", { name: /Engellenenler/ });
    expect(chip).toHaveTextContent("1");
    await user.click(chip);
    expect(screen.getByText("Engelli AŞ")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Engelli AŞ/ })).toBeNull();
    // Vazgeçilirse kaldırılmaz.
    h.confirm.mockResolvedValueOnce(false);
    await user.click(screen.getByRole("button", { name: "Engeli kaldır" }));
    expect(h.unblock).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Engeli kaldır" }));
    expect(h.confirm).toHaveBeenLastCalledWith(expect.objectContaining({ title: "Engel kaldırılsın mı?" }));
    expect(h.unblock).toHaveBeenCalledWith("x7");
    expect(h.toast.success).toHaveBeenCalledWith("Engel kaldırıldı");
  });

  it("Engellenenler boşken açıklayıcı boş durum", async () => {
    const user = userEvent.setup();
    render(<ConnectionsView />);
    await user.click(screen.getByRole("button", { name: /Engellenenler/ }));
    expect(screen.getByText("Engellediğiniz firma yok")).toBeInTheDocument();
  });

  it("Reddet, Geri çek ve davet İptal et onay ister; vazgeçince istek atılmaz (D-265)", async () => {
    const user = userEvent.setup();
    h.incoming = [{ connectionId: "g1", company: co(9), createdAt: "" }];
    h.outgoing = [{ connectionId: "o1", company: co(5), createdAt: "" }];
    h.referrals = [{ id: "r1", email: "yeni@firma.com", createdAt: "" }];
    h.confirm.mockResolvedValue(false);
    render(<ConnectionsView />);
    await user.click(screen.getByRole("button", { name: /Gelen istekler/ }));
    await user.click(screen.getByRole("button", { name: "Reddet" }));
    expect(h.confirm).toHaveBeenLastCalledWith(
      expect.objectContaining({ title: "İstek reddedilsin mi?", description: expect.stringContaining("Firma 9") }),
    );
    expect(h.respond).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: /Bekleyenler/ }));
    await user.click(screen.getByRole("button", { name: "Geri çek" }));
    expect(h.disconnect).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "İptal et" }));
    expect(h.confirm).toHaveBeenLastCalledWith(
      expect.objectContaining({ title: "Davet iptal edilsin mi?", description: expect.stringContaining("yeni@firma.com") }),
    );
    expect(h.cancelReferral).not.toHaveBeenCalled();

    h.confirm.mockResolvedValue(true);
    await user.click(screen.getByRole("button", { name: "Geri çek" }));
    expect(h.disconnect).toHaveBeenCalledWith("o1");
    await user.click(screen.getByRole("button", { name: "İptal et" }));
    expect(h.cancelReferral).toHaveBeenCalledWith("r1");
    await user.click(screen.getByRole("button", { name: /Gelen istekler/ }));
    await user.click(screen.getByRole("button", { name: "Reddet" }));
    expect(h.respond).toHaveBeenCalledWith({ connectionId: "g1", action: "reject" });
  });

  it("Davet et: tek adres → tekil uç, çok adres → toplu uç", async () => {
    const user = userEvent.setup();
    h.batch.mockResolvedValue({ summary: { request: 1, invited: 1, skipped: 0 }, results: [] });
    render(<ConnectionsView />);
    await user.click(screen.getByRole("button", { name: /Davet et/ }));
    const box = await screen.findByLabelText("Davet edilecek e-posta adresleri");
    await user.type(box, "x@y.com");
    await user.click(screen.getByRole("button", { name: "Davet gönder" }));
    expect(h.invite).toHaveBeenCalledWith({ email: "x@y.com", locale: "tr" });
    await user.click(screen.getByRole("button", { name: /Davet et/ }));
    const box2 = await screen.findByLabelText("Davet edilecek e-posta adresleri");
    await user.type(box2, "a@b.com, c@d.com");
    await user.click(screen.getByRole("button", { name: "2 adrese davet gönder" }));
    expect(h.batch).toHaveBeenCalledWith([
      { email: "a@b.com", locale: "tr" },
      { email: "c@d.com", locale: "tr" },
    ]);
  });

  it("Davet et: adres başına davet dili — uzantıdan varsayılan (.kz → Русский), değiştirilebilir", async () => {
    const user = userEvent.setup();
    h.batch.mockResolvedValue({ summary: { request: 0, invited: 2, skipped: 0 }, results: [] });
    render(<ConnectionsView />);
    await user.click(screen.getByRole("button", { name: /Davet et/ }));
    await user.type(await screen.findByLabelText("Davet edilecek e-posta adresleri"), "zakupki@zavod.kz, info@firma.com");
    const kz = screen.getByLabelText("zakupki@zavod.kz için davet dili") as HTMLSelectElement;
    const com = screen.getByLabelText("info@firma.com için davet dili") as HTMLSelectElement;
    expect(kz.value).toBe("ru");
    // Genel uzantı → davet edenin (arayüz) dili.
    expect(com.value).toBe("tr");
    await user.selectOptions(com, "en");
    await user.click(screen.getByRole("button", { name: "2 adrese davet gönder" }));
    expect(h.batch).toHaveBeenCalledWith([
      { email: "zakupki@zavod.kz", locale: "ru" },
      { email: "info@firma.com", locale: "en" },
    ]);
  });

  it("e-posta GİTMEDİYSE 'gönderildi' denmez: tekil uçta uyarı, toplu uçta gönderilemeyen sayısı + satır rozeti", async () => {
    const user = userEvent.setup();
    h.toast.success.mockReset();
    h.toast.warning.mockReset();
    h.invite.mockResolvedValueOnce({ kind: "invited", email: "x@y.com", delivery: "SUPPRESSED", emailSent: false });
    render(<ConnectionsView />);
    await user.click(screen.getByRole("button", { name: /Davet et/ }));
    await user.type(await screen.findByLabelText("Davet edilecek e-posta adresleri"), "x@y.com");
    await user.click(screen.getByRole("button", { name: "Davet gönder" }));
    expect(h.toast.warning).toHaveBeenCalledWith(expect.stringContaining("x@y.com"));
    expect(h.toast.warning).toHaveBeenLastCalledWith(expect.stringContaining("geri çevirdi"));
    expect(h.toast.success).not.toHaveBeenCalled();

    // Teslim edilemez alan adı: "adres geri çevirdi" DEĞİL, "alan adına teslim edilemez".
    h.invite.mockResolvedValueOnce({
      kind: "invited",
      email: "x@firma.test",
      delivery: "SUPPRESSED",
      emailSent: false,
      undeliverable: true,
    });
    const single = screen.getByLabelText("Davet edilecek e-posta adresleri");
    await user.clear(single);
    await user.type(single, "x@firma.test");
    await user.click(screen.getByRole("button", { name: "Davet gönder" }));
    expect(h.toast.warning).toHaveBeenLastCalledWith(
      expect.stringContaining("bu alan adına e-posta teslim edilemez"),
    );

    // Staging izin listesi: "adres geri çevirdi" DEĞİL, "bu ortamda gönderilmedi".
    h.invite.mockResolvedValueOnce({
      kind: "invited",
      email: "x@firma.com",
      delivery: "SUPPRESSED",
      emailSent: false,
      allowlist: true,
    });
    await user.clear(single);
    await user.type(single, "x@firma.com");
    await user.click(screen.getByRole("button", { name: "Davet gönder" }));
    expect(h.toast.warning).toHaveBeenLastCalledWith(expect.stringContaining("izin listesindeki"));

    h.batch.mockResolvedValueOnce({
      summary: { request: 0, invited: 1, skipped: 0, failed: 1 },
      results: [
        { email: "a@b.com", status: "invited", code: "SENT" },
        { email: "c@d.com", status: "failed", code: "FAILED", reason: "Gönderilemedi" },
      ],
    });
    const box = screen.getByLabelText("Davet edilecek e-posta adresleri");
    await user.clear(box);
    await user.type(box, "a@b.com, c@d.com");
    await user.click(screen.getByRole("button", { name: "2 adrese davet gönder" }));
    expect(h.toast.warning).toHaveBeenLastCalledWith("1 adrese e-posta gönderilemedi");
    expect(await screen.findByText("c@d.com")).toBeInTheDocument();
    expect(screen.getAllByText("Gönderilemedi").length).toBeGreaterThan(0);
  });
});
