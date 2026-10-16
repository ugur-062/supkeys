// @vitest-environment jsdom
/**
 * Bağlantılar yeniden tasarımı (2026-09-10, dördüncü tur — TABLO): Keşfet,
 * sekme ve ray YOK; başlıkta "Firma bul" + "Davet et"; arama üstte, altında
 * görünüm çipleri (Bağlantılarım · Gelen istekler · Bekleyenler, sayılı),
 * altında dense tablo; 50'şer çizim; izinsiz üye salt-okunur.
 */
import { onlineManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  tier: "GOLD",
  perm: true,
  connections: [] as unknown[],
  incoming: [] as unknown[],
  outgoing: [] as unknown[],
  referrals: [] as unknown[],
  blocks: [] as unknown[],
  /** Sorgu durumu: `ok` yanıt geldi · `loading` ilk yükleme · `error` okunamadı (kesinti). */
  status: {} as Record<string, "ok" | "loading" | "error">,
  refetch: {} as Record<string, ReturnType<typeof vi.fn>>,
  /** GERÇEK liste kancaları (TanStack sorguları) koşsun — çevrimdışı / duraklatılmış sorgu testi. */
  real: false,
  get: vi.fn(),
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
/** TanStack Query sonucunun bileşenin okuduğu kesiti. */
const listQuery = (name: string, data: unknown[]) => {
  const status = h.status[name] ?? "ok";
  h.refetch[name] ??= vi.fn();
  return {
    data: status === "ok" ? data : undefined,
    // İlk yüklemede istek sürer: TanStack'te hem `isPending` hem `isLoading`.
    isPending: status === "loading",
    isLoading: status === "loading",
    isError: status === "error",
    refetch: h.refetch[name],
  };
};
vi.mock("@/lib/company-auth/api", () => ({ companyApi: { get: h.get } }));
vi.mock("@/hooks/use-company-connections", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/use-company-connections")>();
  // `h.real` ise GERÇEK kanca koşar; seçim test boyunca sabittir (kanca sırası değişmez).
  const list = (real: () => unknown, name: string, data: () => unknown[]) => () => {
    const query = h.real ? real : () => listQuery(name, data());
    return query();
  };
  return {
    useConnectionSelf: () => ({ data: { rothernId: "AAAA-0001" } }),
    useConnections: list(actual.useConnections, "connections", () => h.connections),
    useIncomingInvites: list(actual.useIncomingInvites, "incoming", () => h.incoming),
    useOutgoingInvites: list(actual.useOutgoingInvites, "outgoing", () => h.outgoing),
    useReferralInvites: list(actual.useReferralInvites, "referrals", () => h.referrals),
    useRespondInvite: () => ({ mutateAsync: h.respond, isPending: false, variables: undefined }),
    useCancelReferralInvite: () => ({ mutateAsync: h.cancelReferral, isPending: false, variables: undefined }),
    useDisconnect: () => ({ mutateAsync: h.disconnect, isPending: false, variables: undefined }),
    useBlocks: list(actual.useBlocks, "blocks", () => h.blocks),
    useUnblockCompany: () => ({ mutateAsync: h.unblock, isPending: false, variables: undefined }),
    useBlockCompany: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useInviteByEmail: () => ({ mutateAsync: h.invite, isPending: false }),
    useInviteByEmailBatch: () => ({ mutateAsync: h.batch, isPending: false }),
  };
});

import { ConnectionsView, emailBreakParts } from "../connections-view";
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

/** E-posta davetinin adresi birden çok düğümde (`EmailText`): öğenin TÜM metniyle eşleşir. */
const emailEl = (email: string) => screen.getByText((_, el) => el?.tagName === "DIV" && el.textContent === email);

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
  h.status = {};
  h.refetch = {};
  h.real = false;
  h.search = "";
  h.confirm.mockResolvedValue(true);
  h.invite.mockResolvedValue({ kind: "invited", email: "x@y.com" });
});
afterEach(() => {
  // Çevrimdışı testi ağı kapatır; sonraki testler çevrimiçi başlasın.
  onlineManager.setOnline(true);
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
    expect(emailEl("yeni@firma.com")).toBeInTheDocument();
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

  /**
   * Canlı doğrulama OUT-2 (API kesintisi): bağlantısı olan firmaya çipler
   * "Bağlantılarım 0 · Gelen istekler 0 · Bekleyenler 0 · Engellenenler 0",
   * liste de "Henüz bağlantınız yok" + "Firma bul" çiziyordu — hata kartı yoktu.
   * Kural: boş durum yalnız BAŞARILI ve boş yanıtta; okunamayan sayı 0 değildir.
   */
  describe("liste durumları — hata ≠ boş, okunamayan sayı ≠ 0", () => {
    const chipTexts = () =>
      within(screen.getByRole("group", { name: "Görünüm" }))
        .getAllByRole("button")
        .map((b) => b.textContent);

    it("kesinti: sıfır rozeti ve 'Henüz bağlantınız yok' YOK; hata kartı + Tekrar dene yeniden çeker", async () => {
      const user = userEvent.setup();
      h.status = { connections: "error", incoming: "error", outgoing: "error", referrals: "error", blocks: "error" };
      render(<ConnectionsView />);
      expect(chipTexts()).toEqual(["Bağlantılarım", "Gelen istekler", "Bekleyenler", "Engellenenler"]);
      expect(screen.queryByText("Henüz bağlantınız yok")).toBeNull();
      expect(screen.getByRole("alert")).toHaveTextContent("Bir şeyler ters gitti");
      await user.click(screen.getByRole("button", { name: "Tekrar dene" }));
      expect(h.refetch.connections).toHaveBeenCalledTimes(1);
      expect(h.refetch.incoming).not.toHaveBeenCalled();
    });

    it("kesinti her görünümde hata kartı verir — 'yok' iddiası hiçbirinde çizilmez", async () => {
      const user = userEvent.setup();
      h.status = { connections: "error", incoming: "error", outgoing: "ok", referrals: "error", blocks: "error" };
      render(<ConnectionsView />);
      await user.click(screen.getByRole("button", { name: /Gelen istekler/ }));
      expect(screen.getByRole("alert")).toBeInTheDocument();
      expect(screen.queryByText("Bekleyen istek yok")).toBeNull();
      await user.click(screen.getByRole("button", { name: /Engellenenler/ }));
      expect(screen.getByRole("alert")).toBeInTheDocument();
      expect(screen.queryByText("Engellediğiniz firma yok")).toBeNull();
      // Bekleyenler iki uçtan okur: biri düştüyse sayı da liste de bilinmiyor.
      await user.click(screen.getByRole("button", { name: /Bekleyenler/ }));
      expect(screen.getByRole("alert")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Bekleyenler/ })).toHaveTextContent(/^Bekleyenler$/);
      await user.click(screen.getByRole("button", { name: "Tekrar dene" }));
      expect(h.refetch.referrals).toHaveBeenCalledTimes(1);
      expect(h.refetch.outgoing).not.toHaveBeenCalled();
    });

    it("yüklenirken de rozet yok (henüz okunmadı), iskelet çizilir", () => {
      h.status = { connections: "loading", incoming: "loading", outgoing: "loading", referrals: "loading", blocks: "loading" };
      render(<ConnectionsView />);
      expect(chipTexts()).toEqual(["Bağlantılarım", "Gelen istekler", "Bekleyenler", "Engellenenler"]);
      expect(screen.queryByText("Henüz bağlantınız yok")).toBeNull();
      expect(screen.queryByRole("alert")).toBeNull();
    });

    it("BAŞARILI ve boş yanıt: gerçek sıfır rozeti + boş durum (hata kartı değil)", () => {
      h.connections = [];
      render(<ConnectionsView />);
      expect(chipTexts()).toEqual(["Bağlantılarım0", "Gelen istekler0", "Bekleyenler0", "Engellenenler0"]);
      expect(screen.getByText("Henüz bağlantınız yok")).toBeInTheDocument();
      expect(screen.queryByRole("alert")).toBeNull();
    });

    /**
     * Gözden geçirme REV-2: cihaz çevrimdışıyken TanStack sorguyu DURAKLATIR —
     * istek gitmez, hata da olmaz (`isLoading` false, `isError` false, veri yok).
     * İskelet `isLoading`e bağlıyken liste boş durum dalına düşüyor, okunamayan
     * sayı (`null`) yüzünden "Eşleşen bağlantı yok — “” ile eşleşen bağlantınız
     * bulunamadı." yazıyordu. Gerçek kancalar + gerçek sorgu istemcisi.
     */
    it("cihaz çevrimdışı (sorgular duraklatıldı): hiçbir görünümde 'yok' iddiası yok, iskelet; bağlantı dönünce liste gelir", async () => {
      const user = userEvent.setup();
      h.real = true;
      h.get.mockImplementation((url: string) =>
        Promise.resolve({ data: url === "/company/connections" ? h.connections : [] }),
      );
      onlineManager.setOnline(false);
      const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
      const { container } = render(
        <QueryClientProvider client={qc}>
          <ConnectionsView />
        </QueryClientProvider>,
      );
      const skeleton = () => container.querySelector(".animate-pulse");
      const claims = [
        "Eşleşen bağlantı yok",
        "Henüz bağlantınız yok",
        "Bekleyen istek yok",
        "Bekleyen isteğiniz yok",
        "Engellediğiniz firma yok",
      ];
      const expectNoClaim = () => {
        for (const claim of claims) expect(screen.queryByText(claim)).toBeNull();
        expect(screen.queryByRole("alert")).toBeNull();
        expect(skeleton()).not.toBeNull();
      };
      expectNoClaim();
      // Okunmamış sayı rozet olarak basılmaz.
      expect(chipTexts()).toEqual(["Bağlantılarım", "Gelen istekler", "Bekleyenler", "Engellenenler"]);
      for (const name of [/Gelen istekler/, /Bekleyenler/, /Engellenenler/, /Bağlantılarım/]) {
        await user.click(screen.getByRole("button", { name }));
        expectNoClaim();
      }
      // Duraklatılan sorgu istek ATMAZ: ne hata ne yanıt var.
      expect(h.get).not.toHaveBeenCalled();

      act(() => onlineManager.setOnline(true));
      expect(await screen.findByText("Firma 1")).toBeInTheDocument();
      expect(skeleton()).toBeNull();
      expect(within(screen.getByRole("group", { name: "Görünüm" })).getByRole("button", { name: /Bağlantılarım/ })).toHaveTextContent("2");
      qc.clear();
    });
  });
});

/**
 * MOBİL DENETİM g05/g08 (kullanıcı kararı: satır satır okunan tablo telefonda
 * kart): DOM aynı tablo, sm altında her satır sarılan bir kart — firma en az
 * 11rem alıp büyür, eylemler sağda; sığmazsa eylemler alt satıra iner. Ad ve
 * alt satır telefonda kırpılmaz. Kısa yer tutucu, 44 px "Kopyala".
 */
describe("ConnectionsView — telefon düzeni", () => {
  const originalMatchMedia = window.matchMedia;
  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });
  const setNarrow = (narrow: boolean) => {
    window.matchMedia = ((query: string) => ({
      matches: query === "(max-width: 639.98px)" ? narrow : false,
      media: query,
      addEventListener() {},
      removeEventListener() {},
    })) as unknown as typeof window.matchMedia;
  };

  it("satır telefonda kart: tablo blok akışı, başlık satırı gizli, firma büyür, eylem sağda", async () => {
    const user = userEvent.setup();
    h.incoming = [{ connectionId: "g1", company: co(9, { name: "QA Tedarikçi 2 A.Ş." }), createdAt: "" }];
    render(<ConnectionsView />);
    const table = screen.getByRole("table");
    // Catalyst kaydırma kabı (tablonun iki üstü) telefonda sarar ve blok olur.
    const scroller = table.parentElement!.parentElement!;
    expect(scroller.className).toMatch(/(^|\s)max-sm:whitespace-normal(\s|$)/);
    expect(scroller.className).toMatch(/max-sm:\[&_table\]:block/);
    // Catalyst'in olası kenar taşması telefonda sıfırlanır (satır kartın içinde).
    expect(scroller.className).toMatch(/(^|\s)max-sm:mx-0(\s|$)/);
    expect(table.querySelector("thead")!.className).toMatch(/(^|\s)max-sm:hidden(\s|$)/);

    await user.click(screen.getByRole("button", { name: /Gelen istekler/ }));
    const accept = screen.getByRole("button", { name: "Kabul et" });
    const row = accept.closest("tr")!;
    expect(row.className).toMatch(/(^|\s)max-sm:flex(\s|$)/);
    expect(row.className).toMatch(/(^|\s)max-sm:flex-wrap(\s|$)/);
    expect(row.className).toMatch(/(^|\s)max-sm:px-2(\s|$)/);
    const [firm] = Array.from(row.querySelectorAll("td"));
    expect(firm!.className).toMatch(/max-sm:flex-\[1_1_11rem\]/);
    expect(firm!.className).toMatch(/(^|\s)max-sm:max-w-none(\s|$)/);
    expect(accept.closest("td")!.className).toMatch(/(^|\s)max-sm:ml-auto(\s|$)/);
    // Ad telefonda sarar (kırpılmaz); "Doğrulanmış" rozeti adın altına inebilir.
    const name = within(firm!).getByText("QA Tedarikçi 2 A.Ş.");
    expect(name.className).toMatch(/(^|\s)max-sm:whitespace-normal(\s|$)/);
  });

  it("e-posta daveti: açıklama xl altında listenin üstünde BİR kez (telefon + RU tablet); adres kırpılmaz", async () => {
    const user = userEvent.setup();
    h.referrals = [
      { id: "r1", email: "miguelez@miguelez.com", createdAt: "" },
      { id: "r2", email: "info@kiracelektrik.com", createdAt: "" },
    ];
    render(<ConnectionsView />);
    await user.click(screen.getByRole("button", { name: /Bekleyenler/ }));
    const hints = screen.getAllByText(/E-postadaki bağlantıyla kaydolursa/);
    // Biri listenin üstünde (xl altında: telefon ve RU 768 / 1024'te firma sütunu 144-160 px), ikisi satırlarda (yalnız xl+).
    expect(hints).toHaveLength(3);
    expect(hints.filter((el) => /(^|\s)xl:hidden(\s|$)/.test(el.className))).toHaveLength(1);
    expect(hints.filter((el) => /(^|\s)max-xl:hidden(\s|$)/.test(el.className))).toHaveLength(2);
    // Her genişlikte sarar, "…" ile kesilmez; son çare sarma `break-words` (anywhere DEĞİL:
    // bölünmez parça hücrenin en küçük genişliğini belirler).
    const email = emailEl("miguelez@miguelez.com");
    expect(email.className).toMatch(/(^|\s)break-words(\s|$)/);
    expect(email.className).toMatch(/(^|\s)whitespace-normal(\s|$)/);
    expect(email.className).not.toMatch(/anywhere|(^|\s)truncate(\s|$)/);
  });

  // v-public-filter-comm#new0: RU 360'ta 124 px'lik sütunda adresler alan
  // adının ortasından bölünüyordu ("tanerelektrik.co | m.tr", "noark- | electric").
  it("e-posta yalnız @'ten sonra ve noktalardan önce kırılır; son ek (com.tr) bütün; tire bölünmez; hücre en az bölünmez parça kadar", async () => {
    const user = userEvent.setup();
    h.referrals = [
      { id: "r1", email: "info@tanerelektrik.com.tr", createdAt: "" },
      { id: "r2", email: "europe@noark-electric.com", createdAt: "" },
    ];
    render(<ConnectionsView />);
    await user.click(screen.getByRole("button", { name: /Bekleyenler/ }));
    const taner = emailEl("info@tanerelektrik.com.tr");
    // Kırılma fırsatları (`<wbr>`) yalnız "info@" ve "tanerelektrik" sonrasında; alan adı satır içi blokta
    // (sığıyorsa bütün hâlde alt satıra iner).
    const marks = (node: Node): string =>
      Array.from(node.childNodes)
        .map((n) => (n.nodeName === "WBR" ? "|" : n.nodeName === "SPAN" && (n as HTMLElement).className.includes("inline-block") ? `[${marks(n)}]` : n.textContent))
        .join("");
    expect(marks(taner)).toBe("info@|[tanerelektrik|.com.tr]");
    const domain = taner.querySelector("span.inline-block") as HTMLElement;
    expect(domain.className).toMatch(/(^|\s)max-w-full(\s|$)/);
    // Tire bir sonraki harfle bölünmez kutuda; kopyalanan metin adresin aynısı.
    const noark = emailEl("europe@noark-electric.com");
    expect(marks(noark)).toBe("europe@|[noark-electric|.com]");
    const glued = Array.from(noark.querySelectorAll("span")).find((sp) => sp.textContent === "-e");
    expect(glued?.className).toMatch(/(^|\s)whitespace-nowrap(\s|$)/);
    expect(noark.textContent).toBe("europe@noark-electric.com");
    // Hücre: telefonda en az içerik (bölünmez parça), en çok satır; sığmazsa eylem alt satıra iner.
    const cell = taner.closest("td")!;
    expect(cell.className).toMatch(/(^|\s)max-sm:min-w-auto(\s|$)/);
    expect(cell.className).toMatch(/(^|\s)max-sm:max-w-full(\s|$)/);
    expect(cell.className).not.toMatch(/max-sm:min-w-0/);
    expect(cell.className).toMatch(/max-sm:flex-\[1_1_9rem\]/);
  });

  // RU 768 / 1024: "Отрасль · город" sütunu (154 px) + geniş "Статус" rozeti firma sütununu
  // 144-160 px'e indiriyordu; aynı bilgi firma adının altında zaten yazıyor.
  it("sektör · şehir sütunu yalnız xl+ (tablet genişliğinde firma sütununa yer kalır)", async () => {
    const user = userEvent.setup();
    h.referrals = [{ id: "r1", email: "yeni@firma.com", createdAt: "" }];
    render(<ConnectionsView />);
    const th = screen.getAllByRole("columnheader")[1]!;
    expect(th.className).toMatch(/(^|\s)xl:table-cell(\s|$)/);
    expect(th.className).not.toMatch(/md:table-cell/);
    for (const tr of screen.getAllByRole("row").slice(1)) {
      expect(tr.querySelectorAll("td")[1]!.className).toMatch(/(^|\s)xl:table-cell(\s|$)/);
    }
    await user.click(screen.getByRole("button", { name: /Bekleyenler/ }));
    const referralRow = emailEl("yeni@firma.com").closest("tr")!;
    expect(referralRow.querySelectorAll("td")[1]!.className).toMatch(/(^|\s)xl:table-cell(\s|$)/);
  });

  it("emailBreakParts: kişi@ · ilk etiket · .etiket; kısa ikinci düzey son ek son etiketle birlikte", () => {
    expect(emailBreakParts("info@tanerelektrik.com.tr")).toEqual(["info@", "tanerelektrik", ".com.tr"]);
    expect(emailBreakParts("hydrotor@hydrotor.com.pl")).toEqual(["hydrotor@", "hydrotor", ".com.pl"]);
    expect(emailBreakParts("eti@eti.si")).toEqual(["eti@", "eti", ".si"]);
    expect(emailBreakParts("satis@mail.firma.com")).toEqual(["satis@", "mail", ".firma", ".com"]);
    expect(emailBreakParts("a@b.co.uk")).toEqual(["a@", "b", ".co.uk"]);
    expect(emailBreakParts("x@localhost")).toEqual(["x@", "localhost"]);
    // Adres değilse bölünmez.
    expect(emailBreakParts("adres-yok")).toEqual(["adres-yok"]);
    expect(emailBreakParts("@firma.com")).toEqual(["@firma.com"]);
    for (const e of ["info@tanerelektrik.com.tr", "satis@mail.firma.com", "a@b.co.uk"]) expect(emailBreakParts(e).join("")).toBe(e);
  });

  // Mobil denetim g05 (yeniden doğrulama): RU 360'ta "В ожидании"daki her
  // satırın TEK eylemi ("Отменить" / "Отозвать") e-postanın altına iniyordu
  // (11rem + boşluk + eylem 302 px > satır 294 px; satırlar 109–117 px).
  it("tek kısa eylemli satır (e-posta daveti, giden istek): firma 9rem — eylem yanında kalır; e-posta @'ten sonra sarar", async () => {
    const user = userEvent.setup();
    h.outgoing = [{ connectionId: "o1", company: co(5), createdAt: "" }];
    h.referrals = [{ id: "r1", email: "info@palazzoli.it", createdAt: "" }];
    h.incoming = [{ connectionId: "g1", company: co(9), createdAt: "" }];
    render(<ConnectionsView />);
    await user.click(screen.getByRole("button", { name: /Bekleyenler/ }));
    for (const action of ["İptal et", "Geri çek"]) {
      const row = screen.getByRole("button", { name: action }).closest("tr")!;
      const firm = row.querySelector("td")!;
      expect(firm.className).toMatch(/max-sm:flex-\[1_1_9rem\]/);
      expect(firm.className).not.toMatch(/11rem/);
    }
    const email = emailEl("info@palazzoli.it");
    expect(email.querySelector("wbr")).not.toBeNull();
    expect(email.textContent).toBe("info@palazzoli.it");
    // İki eylemli satır (Kabul et / Reddet) eski tabanda kalır.
    await user.click(screen.getByRole("button", { name: /Gelen istekler/ }));
    const incomingFirm = screen.getByRole("button", { name: "Kabul et" }).closest("tr")!.querySelector("td")!;
    expect(incomingFirm.className).toMatch(/max-sm:flex-\[1_1_11rem\]/);
  });

  it("dar ekranda arama yer tutucusu kısa; geniş ekranda tam", () => {
    setNarrow(true);
    const { unmount } = render(<ConnectionsView />);
    expect(screen.getByLabelText("Bağlantılarımda ara")).toHaveAttribute("placeholder", "Firma, ID, sektör, şehir");
    unmount();
    setNarrow(false);
    render(<ConnectionsView />);
    expect(screen.getByLabelText("Bağlantılarımda ara")).toHaveAttribute(
      "placeholder",
      "Firma adı, Rothern ID, sektör veya şehir",
    );
  });

  it("Rothern ID 'Kopyala' düğmesinin dokunma alanı 44 px (görünmez katman)", () => {
    render(<ConnectionsView />);
    const cls = screen.getByRole("button", { name: "Rothern ID'yi kopyala" }).className;
    expect(cls).toMatch(/(^|\s)relative(\s|$)/);
    expect(cls).toMatch(/(^|\s)after:absolute(\s|$)/);
    expect(cls).toMatch(/(^|\s)after:-inset-y-3(\s|$)/);
  });

  // r3-comm#new2: RU 360'ta alt satır "Стамбул · 0WZH-" / "3BAK" diye ID'nin
  // tiresinden bölünüyordu; ID kopyalanıp aktarılan belirteç.
  it("Rothern ID alt satırda tireden bölünmez: kendi nowrap kutusunda, ayraç öncekine yapışık", async () => {
    const user = userEvent.setup();
    h.connections = [
      { connectionId: "k1", origin: "INVITE", company: co(1), decidedAt: null },
      { connectionId: "k3", origin: "INVITE", company: co(3, { industry: null, city: null }), decidedAt: null },
    ];
    h.outgoing = [{ connectionId: "o1", company: co(5), createdAt: "" }];
    render(<ConnectionsView />);
    const id1 = screen.getByText("BBBB-0001");
    expect(id1.tagName).toBe("SPAN");
    expect(id1.className).toMatch(/(^|\s)whitespace-nowrap(\s|$)/);
    // Sarma fırsatı yalnız "·"dan SONRA: önceki boşluk bükülmez (U+00A0) —
    // satır "·" ile başlamaz, ID bütün hâlde alt satıra iner.
    expect(id1.parentElement!.textContent).toBe("Elektrik\u00A0· Bursa\u00A0· BBBB-0001");
    // Sektör/şehir yoksa ayraç da yok — yalnız ID.
    const id3 = screen.getByText("BBBB-0003");
    expect(id3.className).toMatch(/(^|\s)whitespace-nowrap(\s|$)/);
    expect(id3.parentElement!.textContent).toBe("BBBB-0003");
    // Giden istek satırı (dar 9rem hücre) da aynı.
    await user.click(screen.getByRole("button", { name: /Bekleyenler/ }));
    expect(screen.getByText("BBBB-0005").className).toMatch(/(^|\s)whitespace-nowrap(\s|$)/);
  });

  it("başlıktaki kendi Rothern ID'si de tek parça (nowrap)", () => {
    render(<ConnectionsView />);
    expect(screen.getByText("AAAA-0001").className).toMatch(/(^|\s)whitespace-nowrap(\s|$)/);
  });

  // s4-misc#v4new1: pil `tabular-nums` taşıyordu; Inter'in tabular tiresi rakam
  // genişliğinde kutuda sağa yaslanıyor, ID "RC5M - 2N5T" okunuyordu. Satırlardaki
  // ID'ler gibi orantılı rakam (kimlik belirteci sınıfı, `lib/id-token.ts`).
  it("başlıktaki Rothern ID pili tabular rakamsız: tirenin çevresinde boşluk yok", () => {
    render(<ConnectionsView />);
    const pill = screen.getByText("AAAA-0001").className.split(/\s+/);
    expect(pill).toEqual(expect.arrayContaining(["normal-nums", "tracking-normal", "whitespace-nowrap"]));
    expect(pill.some((c) => /^(tabular-nums|tnum|tracking-wide|tracking-wider|tracking-widest)$/.test(c))).toBe(false);
  });

  it("logolu satır baş harfli satırla aynı girintide (logo kutusu avatar boyunda)", () => {
    h.connections = [
      { connectionId: "k1", origin: "INVITE", company: co(1, { logoUrl: "https://cdn.example.com/l.png" }), decidedAt: null },
    ];
    const { container } = render(<ConnectionsView />);
    const logo = container.querySelector("tbody img")!.parentElement!;
    expect(logo.className).toMatch(/(^|\s)size-8(\s|$)/);
    expect(logo.className).not.toMatch(/(^|\s)size-10(\s|$)/);
  });
});
