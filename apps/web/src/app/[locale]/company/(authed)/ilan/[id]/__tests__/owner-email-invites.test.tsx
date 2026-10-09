// @vitest-environment jsdom
/**
 * Talep detayı — sahip görünümü: "E-postayla davet edilenler" (canlı doğrulama
 * 2026-10-09).
 *  · D3: elle pencereden gönderilen e-posta daveti sayfada hiçbir yerde yoktu
 *    ("Davetli Tedarikçiler" yalnız Rothern üyelerini listeler).
 *  · AI-UI-1: otomatik turun e-posta davetlileri yalnız durum bandındaydı;
 *    "Gizle" denince sonuç bağlantısı (`?ai-davet=1`) boş sayfa açıyordu.
 * Bölüm "Davetli Tedarikçiler"in yanında, tur bandından ve talebin durumundan
 * bağımsız çizilir; sonuç bağlantısı gizlenmiş bandı da geri getirir.
 */
import type { ListingDetail } from "@/hooks/use-company-listings";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  detail: undefined as unknown,
  get: vi.fn(),
  post: vi.fn(),
  search: "",
  denied: [] as string[],
  emailInvites: [] as unknown[],
  discovery: {} as unknown,
  modalClose: undefined as undefined | (() => void),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "l1" }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(h.search),
  usePathname: () => "/company/ilan/l1",
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));
vi.mock("@/components/providers/confirm-dialog", () => ({ useConfirm: () => vi.fn() }));
vi.mock("@/lib/company-auth/api", () => ({
  companyApi: {
    get: h.get,
    post: h.post,
    patch: vi.fn(async () => ({ data: {} })),
    delete: vi.fn(async () => ({ data: {} })),
  },
}));
vi.mock("@/hooks/use-company-auth", () => ({
  useCompanyAuth: () => ({ user: { id: "u1" }, company: { id: "c1", country: "TR", tier: "GOLD", companyVerificationStatus: "VERIFIED" } }),
  useHasCompanyPermission: (p: string) => !h.denied.includes(p),
}));
vi.mock("@/lib/company-auth/store", () => ({
  useCompanyAuthStore: (sel: (s: unknown) => unknown) =>
    sel({
      user: { id: "u1", isOwner: true, roles: ["SAHIP"] },
      company: { id: "c1", country: "TR", tier: "GOLD", companyVerificationStatus: "VERIFIED" },
    }),
}));
vi.mock("@/hooks/use-company-approvals", () => ({
  useCancelApproval: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/use-company-listings", async (importOriginal) => {
  const mod = await importOriginal<Record<string, unknown>>();
  return {
    ...mod,
    useListingDetail: () => ({ data: h.detail, isLoading: false, isFetching: false, isError: false, error: null, refetch: vi.fn() }),
    usePublishListing: () => ({ mutateAsync: vi.fn(), isPending: false }),
  };
});
// Elle davet penceresi: içerik bu dosyanın konusu değil; açık/kapalı durumu sayfadan gelir.
vi.mock("@/components/tenders/supplier-discovery-modal", () => ({
  SupplierDiscoveryModal: ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) => {
    h.modalClose = onClose;
    return isOpen ? <div role="dialog" aria-label="AI ile tedarikçi bul (pencere)" /> : null;
  },
}));

import ListingDetailPage from "../page";

function detail(over: Partial<ListingDetail> = {}): ListingDetail {
  return {
    id: "l1",
    number: "ROT-000831",
    type: "ALIM",
    title: "Paslanmaz boru",
    status: "OPEN",
    format: "RFQ",
    visibility: "PUBLIC",
    aiDiscovery: true,
    isOwner: true,
    createdById: "u1",
    canPublish: false,
    canEdit: true,
    pendingApprovalId: null,
    primaryCurrency: "TRY",
    allowedCurrencies: [],
    categoryIds: [],
    targetCountries: [],
    items: [],
    bids: [],
    invitations: [{ companyName: "Bağlantı AŞ", rothernId: "RTH-1" }],
    ...over,
  } as unknown as ListingDetail;
}

const QUEUED = { id: "e1", email: "info@schrauben.de", name: "Schrauben GmbH", country: "DE", locale: "en", source: "AI_AUTO", invite: "QUEUED", reason: null, sendAfter: "2026-10-12T06:00:00.000Z", sentAt: null, createdAt: "2026-10-09T08:00:00.000Z" };
const SENT = { id: "e2", email: "sales@tubacex.com", name: null, country: "ES", locale: "en", source: "AI_FORM", invite: "INVITED", reason: null, sendAfter: null, sentAt: "2026-10-09T08:05:00.000Z", createdAt: "2026-10-09T07:00:00.000Z" };

const DISMISSED_RUN = {
  aiDiscovery: true,
  listingStatus: "OPEN",
  startsAt: null,
  runs: [
    {
      id: "r1",
      trigger: "PUBLISH",
      state: "DONE",
      createdAt: "2026-10-09T07:50:00.000Z",
      finishedAt: "2026-10-09T07:52:00.000Z",
      dismissedAt: "2026-10-09T08:10:00.000Z",
      candidates: [
        { id: "c1", name: "Schrauben GmbH", email: "info@schrauben.de", website: null, city: null, country: "DE", reason: "r", status: "INVITED", invite: "QUEUED", inviteReason: null },
      ],
    },
  ],
};

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ListingDetailPage />
    </QueryClientProvider>,
  );
}

const emailInviteCalls = () => h.get.mock.calls.filter((c) => c[0] === "/company/connections/external-tender-invites");

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  h.search = "";
  h.denied = [];
  h.emailInvites = [QUEUED, SENT];
  h.discovery = { aiDiscovery: false, listingStatus: "OPEN", startsAt: null, runs: [] };
  h.post.mockResolvedValue({ data: {} });
  h.get.mockImplementation(async (url: string) => {
    if (url === "/company/connections/external-tender-invites") return { data: { items: h.emailInvites } };
    if (url === "/company/ai/supplier-discovery/listings/l1") return { data: h.discovery };
    return { data: [] };
  });
});

describe("Talep detayı (sahip) — E-postayla davet edilenler (D3 / AI-UI-1)", () => {
  it("'Davetli Tedarikçiler'in yanında kalıcı bölüm: kime e-posta daveti gitti, durumu ne", async () => {
    h.detail = detail();
    renderPage();
    const heading = await screen.findByRole("heading", { name: "E-postayla davet edilenler (2)" });
    expect(emailInviteCalls()[0][1]).toMatchObject({ params: { listingId: "l1" } });

    // Üye davetlileri ayrı bölümde kalır; e-posta bölümü hemen ardından gelir.
    const members = screen.getByRole("heading", { name: "Davetli Tedarikçiler (1)" });
    expect(members.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    const section = heading.closest("section")!;
    const queued = within(section).getByText("Schrauben GmbH").closest("li")!;
    expect(within(queued).getByText("Almanya")).toBeInTheDocument();
    expect(within(queued).getByText("AI daveti")).toBeInTheDocument();
    expect(within(queued).getByText("Davet sırada")).toBeInTheDocument();
    expect(within(queued).getByText("Planlanan gönderim: 12 Eki 2026 09:00")).toBeInTheDocument();
    // Adı bilinmeyen adres: adresin kendisi; elle pencereden davet.
    const sent = within(section).getByText("sales@tubacex.com").closest("li")!;
    expect(within(sent).getByText("Elle davet")).toBeInTheDocument();
    expect(within(sent).getByText("Davet edildi")).toBeInTheDocument();
  });

  it("e-posta daveti yoksa bölüm yok; üye davetlileri etkilenmez", async () => {
    h.emailInvites = [];
    h.detail = detail();
    renderPage();
    await waitFor(() => expect(emailInviteCalls()).toHaveLength(1));
    await waitFor(() => expect(screen.queryByText(/E-postayla davet edilenler/)).not.toBeInTheDocument());
    expect(screen.getByRole("heading", { name: "Davetli Tedarikçiler (1)" })).toBeInTheDocument();
  });

  it("talep kapandıktan sonra da (tur bandı çizilmezken) liste durur", async () => {
    h.detail = detail({ status: "CLOSED_NO_AWARD", canEdit: false } as Partial<ListingDetail>);
    renderPage();
    expect(await screen.findByRole("heading", { name: "E-postayla davet edilenler (2)" })).toBeInTheDocument();
    expect(screen.queryByText(/tedarikçi bulundu/)).not.toBeInTheDocument();
  });

  it("AI-UI-1: tur 'Gizle' ile kapatılmışken bant yok ama e-posta davetlileri görünür; ?ai-davet=1 bandı da geri getirir", async () => {
    h.discovery = DISMISSED_RUN;
    h.detail = detail();
    const plain = renderPage();
    expect(await screen.findByRole("heading", { name: "E-postayla davet edilenler (2)" })).toBeInTheDocument();
    await waitFor(() => expect(h.get).toHaveBeenCalledWith("/company/ai/supplier-discovery/listings/l1"));
    expect(screen.queryByText(/tedarikçi bulundu/)).not.toBeInTheDocument();
    plain.unmount();

    h.search = "ai-davet=1";
    renderPage();
    // Sonuç bildirimi / e-posta bağlantısı: durum bandı liste açık gelir.
    const band = (await screen.findByText("1 tedarikçi bulundu")).closest("section")!;
    expect(band).toHaveTextContent("1 tedarikçi bulundu · 1 davet sırada");
    expect(within(band).getByRole("button", { name: "Listeyi gizle" })).toHaveAttribute("aria-expanded", "true");
    expect(within(band).getByText("Schrauben GmbH")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "E-postayla davet edilenler (2)" })).toBeInTheDocument();
  });

  it("R1: sonuç bağlantısı sayfa AÇIKKEN gelirse (zil / canlı bildirim `router.push` — sayfa yeniden bağlanmaz) gizlenmiş bant yine gelir; 'Gizle' parametreyi adresten siler", async () => {
    h.discovery = DISMISSED_RUN;
    h.detail = detail();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const page = () => (
      <QueryClientProvider client={qc}>
        <ListingDetailPage />
      </QueryClientProvider>
    );
    const view = render(page());
    expect(await screen.findByRole("heading", { name: "E-postayla davet edilenler (2)" })).toBeInTheDocument();
    await waitFor(() => expect(h.get).toHaveBeenCalledWith("/company/ai/supplier-discovery/listings/l1"));
    expect(screen.queryByText(/tedarikçi bulundu/)).not.toBeInTheDocument();

    // Alıcı bildirime tıklar: yalnız arama parametresi değişir, AYNI sayfa örneği yeniden çizilir.
    h.search = "ai-davet=1";
    view.rerender(page());
    const band = (await screen.findByText("1 tedarikçi bulundu")).closest("section")!;
    expect(within(band).getByRole("button", { name: "Listeyi gizle" })).toHaveAttribute("aria-expanded", "true");
    expect(within(band).getByText("Schrauben GmbH")).toBeInTheDocument();

    // "Gizle": bant kapanır ve parametre adresten silinir (öteki parametreler durur) —
    // aynı bildirime yeniden tıklamak adresi yine değiştirir, yenileme bandı geri getirmez.
    window.history.replaceState(null, "", "/company/ilan/l1?ai-davet=1&tab=1");
    const replace = vi.spyOn(window.history, "replaceState");
    try {
      await userEvent.setup().click(within(band).getByRole("button", { name: "Gizle" }));
      expect(screen.queryByText(/tedarikçi bulundu/)).not.toBeInTheDocument();
      expect(replace).toHaveBeenCalledTimes(1);
      const next = new URL(String(replace.mock.calls[0][2]), window.location.origin);
      expect(next.pathname).toBe("/company/ilan/l1");
      expect(next.searchParams.has("ai-davet")).toBe(false);
      expect(next.searchParams.get("tab")).toBe("1");
      // Tur zaten gizlenmişti: sunucuya yeniden yazılmaz.
      expect(h.post).not.toHaveBeenCalled();
    } finally {
      replace.mockRestore();
      window.history.replaceState(null, "", "/");
    }
  });

  it("D3: elle davet penceresi kapanınca liste yeniden okunur", async () => {
    h.emailInvites = [];
    h.detail = detail({ aiDiscovery: false } as Partial<ListingDetail>);
    renderPage();
    await waitFor(() => expect(emailInviteCalls()).toHaveLength(1));

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "AI ile tedarikçi bul" }));
    expect(await screen.findByRole("dialog", { name: "AI ile tedarikçi bul (pencere)" })).toBeInTheDocument();
    // Pencerede sales@tubacex.com davet edildi; pencere kapanır.
    h.emailInvites = [SENT];
    h.modalClose!();

    const heading = await screen.findByRole("heading", { name: "E-postayla davet edilenler (1)" });
    expect(within(heading.closest("section")!).getByText("sales@tubacex.com")).toBeInTheDocument();
    expect(emailInviteCalls()).toHaveLength(2);
  });

  it("buy:view yoksa uç çağrılmaz (403 üretmez), bölüm çizilmez", async () => {
    h.denied = ["buy:view"];
    h.detail = detail();
    renderPage();
    await waitFor(() => expect(h.get).toHaveBeenCalled());
    expect(emailInviteCalls()).toHaveLength(0);
    expect(screen.queryByText(/E-postayla davet edilenler/)).not.toBeInTheDocument();
  });
});
