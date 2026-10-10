// @vitest-environment jsdom
/**
 * ONAYLAR — sade düzen sözleşmesi (2026-09-10): İKİ görünüm (Sıra sizde ·
 * Tüm istekler), onay akışları başlıktaki düğmeyle ayrı görünüm; "Tüm
 * istekler" tek listeden (history ucu ÇAĞRILMAZ) çiplerle süzülür; kartta
 * Alış/Satış rozeti ve çift numara yok; adımlar katlanır; karar aksiyonları.
 */
import { onlineManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  decide: vi.fn(),
  cancel: vi.fn(),
  history: vi.fn(),
  tab: null as string | null,
  perms: [] as string[],
  pendingOpts: [] as unknown[],
  /** Sorgu durumu: `ok` yanıt geldi · `loading` ilk yükleme · `error` okunamadı (kesinti). */
  status: "ok" as "ok" | "loading" | "error",
  refetchPending: vi.fn(),
  refetchAll: vi.fn(),
  /** GERÇEK liste kancaları (TanStack sorguları) koşsun — çevrimdışı / duraklatılmış sorgu testi. */
  real: false,
  get: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(h.tab ? `tab=${h.tab}` : ""),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/components/providers/confirm-dialog", () => ({ useConfirm: () => async () => true }));
vi.mock("@/hooks/use-company-auth", () => ({
  useCompanyAuth: () => ({ user: { id: "u1", isOwner: false, roles: [], permissions: ["approval:act", "approvals:manage", "buy:view"] } }),
  useHasCompanyPermission: (p: string) => h.perms.includes(p),
}));
vi.mock("@/components/company/approval-detail-panel", () => ({ ApprovalDetailPanel: ({ id }: { id: string }) => <div data-testid="detail">detay {id}</div> }));
vi.mock("@/app/[locale]/company/(authed)/onaylar/_components/approval-flows-section", () => ({ ApprovalFlowsSection: () => <div data-testid="flows" /> }));
vi.mock("@/hooks/use-debounced-value", () => ({ useDebouncedValue: (v: string) => v }));

const PENDING = [
  {
    id: "a1", requestNo: "ONY-0042", type: "LISTING_AWARD", amount: 184000, currency: "TRY", initiatorNote: "Acil",
    createdBy: "Ali Y.", createdAt: "2026-09-09T10:00:00.000Z",
    listing: { id: "l1", number: "ROT-000042", title: "Çelik boru alımı", type: "ALIM" }, currentStepOrder: 2, totalSteps: 3,
  },
];
const step = (order: number, status: string, name: string) => ({ order, approverName: name, displayLabel: null, status, note: null, decidedAt: null });
const ALL = [
  {
    id: "a1", requestNo: "ONY-0042", type: "LISTING_AWARD", status: "PENDING", amount: 184000, currency: "TRY", initiatorNote: null,
    createdAt: "2026-09-09T10:00:00.000Z", decidedAt: null, createdBy: "Ali Y.", mine: false,
    listing: { id: "l1", number: "ROT-000042", title: "Çelik boru alımı", type: "ALIM" },
    currentStepOrder: 2, currentApprover: "Ayşe K.", totalSteps: 3, decidedSteps: 1,
    steps: [step(1, "APPROVED", "Veli"), step(2, "PENDING", "Ayşe K."), step(3, "WAITING", "Can")],
  },
  {
    id: "a2", requestNo: "ONY-0041", type: "LISTING_AWARD", status: "APPROVED", amount: 9000, currency: "EUR", initiatorNote: null,
    createdAt: "2026-09-01T10:00:00.000Z", decidedAt: "2026-09-02T10:00:00.000Z", createdBy: "Ben", mine: true,
    listing: { id: "l2", number: "ROT-000041", title: "Kablo alımı", type: "ALIM" },
    currentStepOrder: 1, currentApprover: null, totalSteps: 1, decidedSteps: 1, steps: [step(1, "APPROVED", "Veli")],
  },
];

vi.mock("@/lib/company-auth/api", () => ({ companyApi: { get: h.get } }));
vi.mock("@/hooks/use-company-approvals", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/use-company-approvals")>();
  /** TanStack Query sonucunun sayfanın okuduğu kesiti (ilk yüklemede `isPending` + `isLoading`). */
  const fake = (data: unknown[], refetch: () => unknown) => ({
    data: h.status === "ok" ? data : undefined,
    isPending: h.status === "loading",
    isLoading: h.status === "loading",
    isError: h.status === "error",
    refetch,
  });
  // `h.real` ise GERÇEK kanca koşar; seçim test boyunca sabittir (kanca sırası değişmez).
  return {
    usePendingApprovals: (opts: { enabled?: boolean }) => {
      h.pendingOpts.push(opts);
      const query = h.real ? actual.usePendingApprovals : () => fake(PENDING, h.refetchPending);
      return query(opts);
    },
    useAllApprovals: (filters: { search?: string }) => {
      const query = h.real ? actual.useAllApprovals : () => fake(ALL, h.refetchAll);
      return query(filters);
    },
    useApprovalHistory: h.history,
    useDecideApproval: () => ({ mutateAsync: h.decide, isPending: false }),
    useCancelApproval: () => ({ mutateAsync: h.cancel, isPending: false }),
  };
});

import OnaylarPage from "../page";

beforeEach(() => {
  h.decide.mockReset().mockResolvedValue({});
  h.cancel.mockReset().mockResolvedValue({});
  h.history.mockReset();
  h.tab = null;
  h.perms = ["approval:act", "approvals:manage", "buy:view"];
  h.pendingOpts = [];
  h.status = "ok";
  h.refetchPending.mockClear();
  h.refetchAll.mockClear();
  h.real = false;
  h.get.mockReset();
});
afterEach(() => {
  // Çevrimdışı testi ağı kapatır; sonraki testler çevrimiçi başlasın.
  onlineManager.setOnline(true);
});

describe("OnaylarPage", () => {
  it("iki sekme + akış düğmesi; Sıra sizde kartı sade (Alış/Satış yok, tek numara), Detay açılır, Onayla karar verir", async () => {
    render(<OnaylarPage />);
    const tabs = within(screen.getByRole("tablist"));
    expect(tabs.getAllByRole("tab")).toHaveLength(2);
    expect(tabs.getByRole("tab", { name: /Sıra sizde\s*1/ })).toHaveAttribute("aria-selected", "true");
    expect(tabs.getByRole("tab", { name: /Tüm istekler/ })).toBeInTheDocument();
    expect(tabs.queryByRole("tab", { name: /Onay Akışları/ })).toBeNull();
    expect(screen.getByRole("button", { name: /Onay akışlarını düzenle/ })).toBeInTheDocument();

    expect(screen.getByRole("link", { name: "Çelik boru alımı" })).toHaveAttribute("href", "/company/ilan/l1");
    expect(screen.getByText("Adım 2/3")).toBeInTheDocument();
    expect(screen.queryByText("Alış")).toBeNull();
    expect(screen.getAllByText(/ONY-0042/)).toHaveLength(1);
    expect(screen.queryByText("ROT-000042")).toBeNull();
    expect(screen.getByText(/Başlatan notu:/).closest("p")).toHaveTextContent("Acil");

    fireEvent.click(screen.getByRole("button", { name: /Detay/ }));
    expect(screen.getByTestId("detail")).toHaveTextContent("detay a1");
    fireEvent.click(screen.getByRole("button", { name: "Onayla" }));
    await waitFor(() => expect(h.decide).toHaveBeenCalledWith({ id: "a1", action: "approve" }));
  });

  it("Tüm istekler: tek liste (history ucu çağrılmaz), çipler süzer, adımlar katlı, bekleyende iptal", async () => {
    render(<OnaylarPage />);
    fireEvent.click(screen.getByRole("tab", { name: /Tüm istekler/ }));
    expect(h.history).not.toHaveBeenCalled();
    expect(screen.getByText("Çelik boru alımı")).toBeInTheDocument();
    expect(screen.getByText("Kablo alımı")).toBeInTheDocument();
    expect(screen.getByText("Sırada: Ayşe K.")).toBeInTheDocument();
    expect(screen.getByText("Onaylandı")).toBeInTheDocument();
    // Adımlar katlı: özet var, satırlar <details> içinde
    expect(screen.getByText("Adımlar (1/3)")).toBeInTheDocument();
    for (const el of screen.getAllByText(/Veli/)) expect(el.closest("details")).not.toHaveAttribute("open");

    fireEvent.click(screen.getByRole("button", { name: "Başlattıklarım" }));
    expect(screen.queryByText("Çelik boru alımı")).toBeNull();
    expect(screen.getByText("Kablo alımı")).toBeInTheDocument();
    expect(screen.getByText(/Siz başlattınız/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Bekleyen" }));
    expect(screen.queryByText("Kablo alımı")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "İptal et" })); // yönetici → bekleyeni iptal edebilir
    await waitFor(() => expect(h.cancel).toHaveBeenCalledWith("a1"));

    fireEvent.click(screen.getByRole("button", { name: "Sonuçlanan" }));
    expect(screen.queryByText("Çelik boru alımı")).toBeNull();
    expect(screen.getByText("Kablo alımı")).toBeInTheDocument();
  });

  it("?tab=history eski bağlantısı Tüm istekler'e düşer; ?tab=flows akış görünümünü açar, 'Onaylara dön' geri getirir", () => {
    h.tab = "history";
    const { unmount } = render(<OnaylarPage />);
    expect(screen.getByRole("tab", { name: /Tüm istekler/ })).toHaveAttribute("aria-selected", "true");
    unmount();

    h.tab = "flows";
    render(<OnaylarPage />);
    expect(screen.getByTestId("flows")).toBeInTheDocument();
    expect(screen.queryByRole("tablist")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Onaylara dön/ }));
    expect(screen.getByRole("tablist")).toBeInTheDocument();
  });

  it("yalnız approvals:manage: 'Sıra sizde' sekmesi yok, sorgu kapalı, varsayılan Tüm istekler (derin denetim LU-21)", () => {
    h.perms = ["approvals:manage", "buy:view"];
    render(<OnaylarPage />);
    const tabs = within(screen.getByRole("tablist"));
    expect(tabs.getAllByRole("tab")).toHaveLength(1);
    expect(tabs.getByRole("tab", { name: /Tüm istekler/ })).toHaveAttribute("aria-selected", "true");
    expect(tabs.queryByRole("tab", { name: /Sıra sizde/ })).toBeNull();
    expect(h.pendingOpts.every((o) => (o as { enabled?: boolean }).enabled === false)).toBe(true);
  });

  it("approvals:manage yokken ?tab=flows boş sayfa değil, varsayılan sekmeye düşer (derin denetim LU-21)", () => {
    h.perms = ["approval:act", "buy:view"];
    h.tab = "flows";
    render(<OnaylarPage />);
    expect(screen.queryByTestId("flows")).toBeNull();
    expect(screen.getByRole("tab", { name: /Sıra sizde/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toBeInTheDocument();
  });

  it("D-361: reddedilen/iptal edilen istekte karar verilmemiş adımlar 'sırada' / 'karar bekleniyor' değil 'gerek kalmadı'", () => {
    const extra = [
      {
        ...ALL[1]!, id: "a3", requestNo: "ONY-0040", status: "REJECTED", mine: false,
        listing: { id: "l3", number: "ROT-000040", title: "Reddedilen alım", type: "ALIM" },
        totalSteps: 2, decidedSteps: 1, steps: [step(1, "REJECTED", "Veli"), step(2, "WAITING", "Can")],
      },
      {
        ...ALL[1]!, id: "a4", requestNo: "ONY-0039", status: "CANCELLED", mine: false,
        listing: { id: "l4", number: "ROT-000039", title: "İptal edilen alım", type: "ALIM" },
        totalSteps: 1, decidedSteps: 0, steps: [step(1, "PENDING", "Ayşe K.")],
      },
    ];
    ALL.push(...(extra as typeof ALL));
    try {
      render(<OnaylarPage />);
      fireEvent.click(screen.getByRole("tab", { name: /Tüm istekler/ }));
      expect(screen.getAllByText(/^gerek kalmadı$/)).toHaveLength(2);
      // Yalnız hâlâ bekleyen a1'in adımları "karar bekleniyor" / "sırada" der.
      expect(screen.getAllByText(/^karar bekleniyor$/)).toHaveLength(1);
      expect(screen.getAllByText(/^sırada$/)).toHaveLength(1);
    } finally {
      ALL.splice(2);
    }
  });

  /**
   * Canlı doğrulama OUT-2 (API kesintisi): sekmeler hata kartının yanında
   * "Sıra sizde 0 · Tüm istekler 0" yazıyordu. Okunamayan sayı 0 değildir —
   * rozet yalnız yanıt geldiyse çizilir.
   */
  it("liste okunamadı (kesinti): sekmede '0' rozeti YOK, hata kartı + Tekrar dene; boş durum çizilmez", () => {
    h.status = "error";
    render(<OnaylarPage />);
    const tabs = within(screen.getByRole("tablist"));
    expect(tabs.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Sıra sizde", "Tüm istekler"]);
    expect(screen.getByRole("alert")).toHaveTextContent("Kayıtlar yüklenemedi");
    // Son canlı kontrol OUTF-4: kart, hemen üstündeki "Sunucuya şu anda
    // ulaşılamıyor" notuyla çelişmez — kullanıcının kendi bağlantısı suçlanmaz.
    expect(screen.getByRole("alert")).toHaveTextContent("Lütfen yeniden deneyin.");
    expect(screen.getByRole("alert")).not.toHaveTextContent(/bağlantı/i);
    expect(screen.queryByText("Sıra sizde bekleyen onay yok")).toBeNull();
    // Kapanış kontrolü OUTC-1: düğme paneldeki öteki "yeniden dene"ler gibi cümle
    // düzeninde ("Yeniden Dene" değil) — hemen üstündeki not "Tekrar dene" diyor.
    fireEvent.click(screen.getByRole("button", { name: "Yeniden dene" }));
    expect(h.refetchPending).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("tab", { name: /Tüm istekler/ }));
    expect(screen.getByRole("alert")).toHaveTextContent("Kayıtlar yüklenemedi");
    fireEvent.click(screen.getByRole("button", { name: "Yeniden dene" }));
    expect(h.refetchAll).toHaveBeenCalledTimes(1);
  });

  it("yüklenirken de rozet yok (henüz okunmadı); yanıt gelince gerçek sayı (0 dahil)", () => {
    h.status = "loading";
    const { unmount } = render(<OnaylarPage />);
    expect(within(screen.getByRole("tablist")).getAllByRole("tab").map((t) => t.textContent)).toEqual(["Sıra sizde", "Tüm istekler"]);
    unmount();

    h.status = "ok";
    const kept = PENDING.splice(0);
    try {
      render(<OnaylarPage />);
      const tabs = within(screen.getByRole("tablist"));
      expect(tabs.getByRole("tab", { name: /Sıra sizde/ })).toHaveTextContent("Sıra sizde0");
      expect(tabs.getByRole("tab", { name: /Tüm istekler/ })).toHaveTextContent("Tüm istekler2");
    } finally {
      PENDING.push(...kept);
    }
  });

  /**
   * Gözden geçirme REV-2: cihaz çevrimdışıyken TanStack sorguyu DURAKLATIR —
   * istek gitmez, hata da olmaz (`isLoading` false, `isError` false, veri yok).
   * İskelet `isLoading`e bağlıyken yanıt hiç gelmediği hâlde "Sıra sizde bekleyen
   * onay yok" (bekleyen onayı olan onaycıya) ve "Kayıt bulunamadı" çiziliyordu.
   * Gerçek kancalar + gerçek sorgu istemcisi.
   */
  it("cihaz çevrimdışı (sorgular duraklatıldı): iki görünümde de 'yok' iddiası yok, iskelet; bağlantı dönünce liste gelir", async () => {
    h.real = true;
    h.get.mockImplementation((url: string) =>
      Promise.resolve({ data: url === "/company/approvals/pending" ? PENDING : ALL }),
    );
    onlineManager.setOnline(false);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const { container } = render(
      <QueryClientProvider client={qc}>
        <OnaylarPage />
      </QueryClientProvider>,
    );
    const expectNoClaim = () => {
      expect(screen.queryByText("Sıra sizde bekleyen onay yok")).toBeNull();
      expect(screen.queryByText(/Kayıt bulunamadı/)).toBeNull();
      expect(screen.queryByRole("alert")).toBeNull();
      expect(container.querySelector(".animate-pulse")).not.toBeNull();
    };
    expectNoClaim();
    // Okunmamış sayı rozet olarak basılmaz.
    expect(within(screen.getByRole("tablist")).getAllByRole("tab").map((t) => t.textContent)).toEqual(["Sıra sizde", "Tüm istekler"]);
    fireEvent.click(screen.getByRole("tab", { name: /Tüm istekler/ }));
    expectNoClaim();
    // Duraklatılan sorgu istek ATMAZ: ne hata ne yanıt var.
    expect(h.get).not.toHaveBeenCalled();

    act(() => onlineManager.setOnline(true));
    expect(await screen.findByText("Kablo alımı")).toBeInTheDocument();
    expect(container.querySelector(".animate-pulse")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: /Sıra sizde/ }));
    expect(screen.getByRole("link", { name: "Çelik boru alımı" })).toBeInTheDocument();
    qc.clear();
  });
});
