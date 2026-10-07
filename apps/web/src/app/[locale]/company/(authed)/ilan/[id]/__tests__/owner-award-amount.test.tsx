// @vitest-environment jsdom
/**
 * Kazandırma onayında TUTAR (kullanıcı kararı 2026-10-07): kazandırma geri
 * alınamaz; onay penceresi yalnız firma adını söylüyordu. Artık her kazandırma
 * onayı (toplu, kalem bazlı, onaya giden) ilgili tutarı teklif satırıyla aynı
 * biçimde basar; yabancı birimli teklifte sunucunun verdiği TRY karşılığı da.
 */
import { ConfirmProvider } from "@/components/providers/confirm-dialog";
import { formatMoney } from "@/components/ui/money";
import type { ListingDetail } from "@/hooks/use-company-listings";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  detail: undefined as unknown,
  perms: [] as string[],
  company: {} as Record<string, unknown>,
  preview: vi.fn(),
  itemPreview: vi.fn(),
  award: vi.fn(),
  awardByItem: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "l1" }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(""),
  usePathname: () => "/company/ilan/l1",
}));
vi.mock("sonner", () => ({ toast: h.toast }));
vi.mock("@/lib/company-auth/api", () => ({
  companyApi: {
    get: vi.fn(async () => ({ data: [] })),
    post: vi.fn(async () => ({ data: {} })),
    patch: vi.fn(async () => ({ data: {} })),
    delete: vi.fn(async () => ({ data: {} })),
  },
}));
vi.mock("@/hooks/use-company-auth", () => ({
  useCompanyAuth: () => ({ user: { id: "u1", permissions: h.perms }, company: h.company }),
  useHasCompanyPermission: (p: string) => h.perms.includes(p),
}));
vi.mock("@/lib/company-auth/store", () => ({
  useCompanyAuthStore: (sel: (s: unknown) => unknown) =>
    sel({ user: { id: "u1", permissions: h.perms }, company: h.company }),
}));
vi.mock("@/components/tenders/ai-suppliers/listing-suggestions", () => ({
  ListingSuggestions: () => null,
}));
vi.mock("@/hooks/use-company-approvals", () => ({
  useCancelApproval: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/use-company-listings", async (importOriginal) => {
  const mod = await importOriginal<Record<string, unknown>>();
  return {
    ...mod,
    useListingDetail: () => ({
      data: h.detail,
      isLoading: false,
      isFetching: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    }),
    useAwardPreview: () => ({ mutateAsync: h.preview, isPending: false }),
    useAwardByItemPreview: () => ({ mutateAsync: h.itemPreview, isPending: false }),
    useAwardListing: () => ({ mutateAsync: h.award, isPending: false }),
    useAwardByItem: () => ({ mutateAsync: h.awardByItem, isPending: false }),
  };
});

import ListingDetailPage from "../page";

const DAY = 86_400_000;

const bid = (id: string, name: string, over: Record<string, unknown> = {}) => ({
  id,
  bidderName: name,
  bidderCompanyId: `c-${id}`,
  amount: "12500.5",
  currency: "TRY",
  note: null,
  status: "SUBMITTED",
  createdAt: new Date().toISOString(),
  submittedAt: new Date(Date.now() - DAY).toISOString(),
  validityDays: 30,
  items: [{ itemId: "i1", unitPrice: "1250.05" }],
  ...over,
});

function detail(over: Partial<ListingDetail> = {}): ListingDetail {
  return {
    id: "l1",
    number: "ROT-2026-0001",
    type: "ALIM",
    title: "Rulman Alımı",
    status: "OPEN",
    format: "RFQ",
    isOwner: true,
    createdById: "u1",
    canPublish: false,
    canEdit: false,
    pendingApprovalId: null,
    primaryCurrency: "TRY",
    allowedCurrencies: [],
    categoryIds: [],
    targetCountries: [],
    closesAt: new Date(Date.now() + DAY).toISOString(),
    items: [{ id: "i1", name: "Rulman", quantity: "10", unit: "adet" }],
    bids: [bid("b1", "Tedarik A")],
    invitations: [],
    ...over,
  } as unknown as ListingDetail;
}

function AwardAmountHarness() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <ConfirmProvider>
        <ListingDetailPage />
      </ConfirmProvider>
    </QueryClientProvider>
  );
}

const tr = (v: string | number, cur: string) => formatMoney(v, cur, "tr");

beforeEach(() => {
  vi.clearAllMocks();
  h.perms = ["buy:view", "buy:listing:manage", "buy:award"];
  h.company = { id: "c1", country: "TR", tier: "GOLD", companyVerificationStatus: "VERIFIED" };
  h.preview.mockResolvedValue({ requiresApproval: false });
  h.itemPreview.mockResolvedValue({ requiresApproval: false });
  h.award.mockResolvedValue({ pendingApproval: false, number: "ORD-2026-0001" });
  h.awardByItem.mockResolvedValue({ pendingApproval: false, count: 1 });
});

describe("Kazandır onayı tutarı gösterir (kullanıcı kararı 2026-10-07)", () => {
  it("TRY teklif: pencere firma adı + teklif satırıyla aynı biçimde tutar + geri alınamaz uyarısı", async () => {
    h.detail = detail();
    const user = userEvent.setup();
    render(<AwardAmountHarness />);
    await user.click(screen.getByRole("button", { name: "Kazandır" }));
    const dialog = await screen.findByRole("dialog");
    const amount = tr("12500.5", "TRY");
    expect(amount).toMatch(/12\.500,50/);
    expect(within(dialog).getByText(new RegExp(`"Tedarik A" kazandırılsın mı\\?`))).toBeInTheDocument();
    expect(dialog).toHaveTextContent(`Kazandırılacak tutar: ${amount}.`);
    expect(dialog).toHaveTextContent(/GERİ ALINAMAZ/);
    expect(dialog).not.toHaveTextContent("≈");
    expect(h.award).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "Evet, kazandır" }));
    await waitFor(() => expect(h.award).toHaveBeenCalledWith({ bidId: "b1" }));
  });

  it("yabancı birimli teklif: kendi birimindeki tutar + sunucunun verdiği TRY karşılığı", async () => {
    h.detail = detail({
      bids: [
        bid("b1", "Global Supply", {
          amount: "1200",
          currency: "USD",
          amountTry: "58822.08",
          exchangeRateSnapshot: "49.0184",
        }),
      ],
    } as unknown as Partial<ListingDetail>);
    const user = userEvent.setup();
    render(<AwardAmountHarness />);
    await user.click(screen.getByRole("button", { name: "Kazandır" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent(
      `Kazandırılacak tutar: ${tr("1200", "USD")} (≈ ${tr("58822.08", "TRY")}).`,
    );
  });

  it("yabancı birimli teklifte TRY karşılığı yoksa uydurulmaz (istemcide çevrim yok)", async () => {
    h.detail = detail({
      bids: [bid("b1", "Global Supply", { amount: "1200", currency: "USD", exchangeRateSnapshot: "49.0184" })],
    } as unknown as Partial<ListingDetail>);
    const user = userEvent.setup();
    render(<AwardAmountHarness />);
    await user.click(screen.getByRole("button", { name: "Kazandır" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent(`Kazandırılacak tutar: ${tr("1200", "USD")}.`);
    expect(dialog).not.toHaveTextContent("≈");
  });

  it("onaya giden kazandırma: tutar + 'ONAYA gönderilecek, sipariş şimdi oluşmaz' açıklaması", async () => {
    h.preview.mockResolvedValue({ requiresApproval: true });
    h.award.mockResolvedValue({ pendingApproval: true });
    h.detail = detail({
      bids: [bid("b1", "Global Supply", { amount: "1200", currency: "USD", amountTry: "58822.08" })],
    } as unknown as Partial<ListingDetail>);
    const user = userEvent.setup();
    render(<AwardAmountHarness />);
    await user.click(screen.getByRole("button", { name: "Kazandır" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Kazandırmayı onaya gönder")).toBeInTheDocument();
    expect(dialog).toHaveTextContent(/"Global Supply" için kazandırma ONAYA gönderilecek/);
    expect(dialog).toHaveTextContent(
      `Kazandırılacak tutar: ${tr("1200", "USD")} (≈ ${tr("58822.08", "TRY")}).`,
    );
    expect(dialog).toHaveTextContent(/Sipariş şimdi oluşmaz/);
    await user.click(within(dialog).getByRole("button", { name: "Onaya Gönder" }));
    await waitFor(() =>
      expect(h.award).toHaveBeenCalledWith({ bidId: "b1", approvalNote: undefined }),
    );
  });
});

describe("Kalem bazlı kazandırma onayı tutarı gösterir", () => {
  const twoItems = () =>
    detail({
      items: [
        { id: "i1", name: "Rulman", quantity: "10", unit: "adet" },
        { id: "i2", name: "Kayış", quantity: "4", unit: "adet" },
      ],
      bids: [
        bid("b1", "Tedarik A", {
          amount: "1000",
          items: [
            { itemId: "i1", unitPrice: "80" },
            { itemId: "i2", unitPrice: "50" },
          ],
        }),
        bid("b2", "Tedarik B", {
          amount: "1020",
          items: [
            { itemId: "i1", unitPrice: "90" },
            { itemId: "i2", unitPrice: "30" },
          ],
        }),
      ],
    } as unknown as Partial<ListingDetail>);

  it("firma başına tutar + toplam; kısmi miktar tutara yansır", async () => {
    h.detail = twoItems();
    const user = userEvent.setup();
    render(<AwardAmountHarness />);
    await user.click(screen.getByRole("button", { name: "Kalem-bazlı Kazandır" }));
    // Ön-seçim: Rulman → Tedarik A (80), Kayış → Tedarik B (30). Rulman'da 5 adet.
    await user.type(screen.getByLabelText(/Rulman için kazandırılacak miktar/), "5");
    await user.click(screen.getByRole("button", { name: "Onayla & Kazandır" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent(
      `Kazandırılacak toplam tutar: ${tr(520, "TRY")} (Tedarik A: ${tr(400, "TRY")}; Tedarik B: ${tr(120, "TRY")}).`,
    );
    expect(dialog).toHaveTextContent(/GERİ ALINAMAZ/);
    expect(h.awardByItem).not.toHaveBeenCalled();
  });

  it("onaya giden kalem bazlı kazandırma: tutar + onaya gidiş açıklaması", async () => {
    h.itemPreview.mockResolvedValue({ requiresApproval: true });
    h.detail = twoItems();
    const user = userEvent.setup();
    render(<AwardAmountHarness />);
    await user.click(screen.getByRole("button", { name: "Kalem-bazlı Kazandır" }));
    await user.click(screen.getByRole("button", { name: "Onayla & Kazandır" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent(
      `Kazandırılacak toplam tutar: ${tr(920, "TRY")} (Tedarik A: ${tr(800, "TRY")}; Tedarik B: ${tr(120, "TRY")}).`,
    );
    expect(dialog).toHaveTextContent(/Kalem-bazlı kazandırma ONAYA gönderilecek/);
    expect(dialog).toHaveTextContent(/Siparişler şimdi oluşmaz/);
  });

  it("farklı birimli kalemler toplanmaz, birim başına ayrı yazılır", async () => {
    const d = twoItems();
    (d.bids as unknown as { items: Record<string, unknown>[] }[])[1]!.items[1]!.currency = "USD";
    (d.bids as unknown as Record<string, unknown>[])[0]!.items = [{ itemId: "i1", unitPrice: "80" }];
    h.detail = d;
    const user = userEvent.setup();
    render(<AwardAmountHarness />);
    await user.click(screen.getByRole("button", { name: "Kalem-bazlı Kazandır" }));
    await user.click(screen.getByRole("button", { name: "Onayla & Kazandır" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent(
      `Kazandırılacak tutar: Tedarik A: ${tr(800, "TRY")}; Tedarik B: ${tr(120, "USD")}.`,
    );
    expect(dialog).not.toHaveTextContent("toplam tutar");
  });

  it("kesirli miktar: pencere tutarı sunucunun sipariş tutarıyla aynı yuvarlanır (1,5 × 3,33 iki kez → 9,99)", async () => {
    h.detail = detail({
      items: [
        { id: "i1", name: "Rulman", quantity: "1.5", unit: "kg" },
        { id: "i2", name: "Kayış", quantity: "1.5", unit: "kg" },
      ],
      bids: [
        bid("b1", "Tedarik A", {
          amount: "9.99",
          items: [
            { itemId: "i1", unitPrice: "3.33" },
            { itemId: "i2", unitPrice: "3.33" },
          ],
        }),
      ],
    } as unknown as Partial<ListingDetail>);
    const user = userEvent.setup();
    render(<AwardAmountHarness />);
    await user.click(screen.getByRole("button", { name: "Kalem-bazlı Kazandır" }));
    await user.click(screen.getByRole("button", { name: "Onayla & Kazandır" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent(`Kazandırılacak tutar: Tedarik A: ${tr(9.99, "TRY")}.`);
  });
});

describe("Pencere açıkken teklif değişirse kazandırma yapılmaz", () => {
  const CHANGED = /Teklif siz onaylarken değişti; kazandırma yapılmadı/;

  it("toplu kazandırma: onaylanan tutar güncel teklifle uyuşmuyorsa istek gitmez", async () => {
    h.detail = detail();
    const user = userEvent.setup();
    const { rerender } = render(<AwardAmountHarness />);
    await user.click(screen.getByRole("button", { name: "Kazandır" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent(`Kazandırılacak tutar: ${tr("12500.5", "TRY")}.`);
    // Teklif veren bu sırada teklifini revize etti; detay tazelendi.
    h.detail = detail({ bids: [bid("b1", "Tedarik A", { amount: "13900" })] } as unknown as Partial<ListingDetail>);
    rerender(<AwardAmountHarness />);
    await user.click(within(dialog).getByRole("button", { name: "Evet, kazandır" }));
    await waitFor(() => expect(h.toast.error).toHaveBeenCalledWith(expect.stringMatching(CHANGED)));
    expect(h.award).not.toHaveBeenCalled();
  });

  it("onaya giden kazandırma: not yazılırken teklif değiştiyse onaya gönderilmez", async () => {
    h.preview.mockResolvedValue({ requiresApproval: true });
    h.detail = detail();
    const user = userEvent.setup();
    const { rerender } = render(<AwardAmountHarness />);
    await user.click(screen.getByRole("button", { name: "Kazandır" }));
    const dialog = await screen.findByRole("dialog");
    h.detail = detail({ bids: [bid("b1", "Tedarik A", { amount: "13900" })] } as unknown as Partial<ListingDetail>);
    rerender(<AwardAmountHarness />);
    await user.click(within(dialog).getByRole("button", { name: "Onaya Gönder" }));
    await waitFor(() => expect(h.toast.error).toHaveBeenCalledWith(expect.stringMatching(CHANGED)));
    expect(h.award).not.toHaveBeenCalled();
  });

  it("kalem bazlı kazandırma: seçili kalemin fiyatı değiştiyse istek gitmez", async () => {
    const make = (price: string) =>
      detail({
        bids: [bid("b1", "Tedarik A", { items: [{ itemId: "i1", unitPrice: price }] })],
      } as unknown as Partial<ListingDetail>);
    h.detail = make("80");
    const user = userEvent.setup();
    const { rerender } = render(<AwardAmountHarness />);
    await user.click(screen.getByRole("button", { name: "Kalem-bazlı Kazandır" }));
    await user.click(screen.getByRole("button", { name: "Onayla & Kazandır" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent(`Kazandırılacak tutar: Tedarik A: ${tr(800, "TRY")}.`);
    h.detail = make("95");
    rerender(<AwardAmountHarness />);
    await user.click(within(dialog).getByRole("button", { name: "Evet, kazandır" }));
    await waitFor(() => expect(h.toast.error).toHaveBeenCalledWith(expect.stringMatching(CHANGED)));
    expect(h.awardByItem).not.toHaveBeenCalled();
  });

  it("teklif değişmediyse kazandırma olağan sürer (kalem bazlı)", async () => {
    h.detail = detail();
    const user = userEvent.setup();
    render(<AwardAmountHarness />);
    await user.click(screen.getByRole("button", { name: "Kalem-bazlı Kazandır" }));
    await user.click(screen.getByRole("button", { name: "Onayla & Kazandır" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Evet, kazandır" }));
    await waitFor(() => expect(h.awardByItem).toHaveBeenCalledTimes(1));
    expect(h.toast.error).not.toHaveBeenCalled();
  });
});
