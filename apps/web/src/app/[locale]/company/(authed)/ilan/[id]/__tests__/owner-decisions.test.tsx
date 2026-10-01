// @vitest-environment jsdom
/**
 * Talep detayı — sahip görünümü, arayüz testi webB-05:
 *  · O-089 / D-110: talebi açmamış meslektaşa "AI ile tedarikçi bul" yok
 *    (davet ucu talebi yöneteni ister), yerine "yalnız açan kişi" notu.
 *  · O-090: geçerliliği dolmuş teklif kalem kazandırmada ön-seçilmez,
 *    "En iyi" rozeti almaz.
 *  · D-027 / D-044: doğrulanmamış Gold firmada Yayınla ve Kazandır pasif +
 *    doğrulama bağlantısı.
 *  · D-104: kalem miktarını aşan kısmi miktar istemcide durdurulur.
 *  · D-107: kur arayüz dilinin ondalık ayracıyla.
 *  · D-109: süzgeç ?teklifler= ile gelir, boş sonuçta metin.
 *  · D-252: approvals:manage taşıyan yönetici onay isteğini iptal edebilir.
 *  · O-028: reddedilen sipariş + tedariksiz kalemler bandı.
 */
import type { ListingDetail } from "@/hooks/use-company-listings";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  detail: undefined as unknown,
  perms: [] as string[],
  company: {} as Record<string, unknown>,
  search: "",
  preview: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "l1" }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(h.search),
  usePathname: () => "/company/ilan/l1",
}));
vi.mock("sonner", () => ({ toast: h.toast }));
vi.mock("@/components/providers/confirm-dialog", () => ({ useConfirm: () => vi.fn() }));
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
    useAwardByItemPreview: () => ({ mutateAsync: h.preview, isPending: false }),
  };
});

import ListingDetailPage from "../page";

const DAY = 86_400_000;

const bid = (
  id: string,
  name: string,
  prices: Record<string, string>,
  over: Record<string, unknown> = {},
) => ({
  id,
  bidderName: name,
  bidderCompanyId: `c-${id}`,
  amount: String(Object.values(prices).reduce((a, p) => a + Number(p) * 10, 0)),
  currency: "TRY",
  note: null,
  status: "SUBMITTED",
  createdAt: new Date().toISOString(),
  submittedAt: new Date(Date.now() - DAY).toISOString(),
  validityDays: 30,
  items: Object.entries(prices).map(([itemId, unitPrice]) => ({ itemId, unitPrice })),
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
    bids: [bid("b1", "Canli Teklif", { i1: "80" })],
    invitations: [],
    ...over,
  } as unknown as ListingDetail;
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ListingDetailPage />
    </QueryClientProvider>,
  );
}

const visible = (name: string | RegExp) =>
  screen.queryAllByRole("button", { name }).filter((b) => !b.closest(".invisible"));

beforeEach(() => {
  vi.clearAllMocks();
  h.search = "";
  h.perms = ["buy:view", "buy:listing:manage", "buy:award"];
  h.company = { id: "c1", country: "TR", tier: "GOLD", companyVerificationStatus: "VERIFIED" };
  h.preview.mockResolvedValue({ requiresApproval: false });
});

describe("talebi açmamış meslektaş (O-089 / D-110)", () => {
  it("AI ile tedarikçi bul yok, 'yalnız açan kişi' notu var", () => {
    h.detail = detail({ createdById: "u2" } as Partial<ListingDetail>);
    renderPage();
    expect(screen.queryByRole("button", { name: /AI ile tedarikçi bul/ })).toBeNull();
    expect(screen.getByText(/Bu talebi yalnız açan kişi yönetebilir/)).toBeInTheDocument();
  });

  it("talebi açan kişide AI düğmesi var, not yok", () => {
    h.detail = detail();
    renderPage();
    expect(screen.getByRole("button", { name: /AI ile tedarikçi bul/ })).toBeInTheDocument();
    expect(screen.queryByText(/Bu talebi yalnız açan kişi yönetebilir/)).toBeNull();
  });

  it("talebi açan ama yönetim izni olmayan kişiye 'yalnız açan kişi' değil yetki notu", () => {
    h.perms = ["buy:view"];
    h.detail = detail();
    renderPage();
    expect(screen.queryByText(/Bu talebi yalnız açan kişi yönetebilir/)).toBeNull();
    expect(screen.getByText(/rolünüzde talep yönetme yetkisi yok/)).toBeInTheDocument();
  });
});

describe("doğrulanmamış Gold firma (D-027 / D-044)", () => {
  beforeEach(() => {
    h.company = { id: "c1", country: "TR", tier: "GOLD", companyVerificationStatus: "UNVERIFIED" };
  });

  it("taslakta Yayınla pasif + doğrulama bağlantısı", () => {
    h.detail = detail({ status: "DRAFT", canPublish: true, canEdit: true, bids: [] } as Partial<ListingDetail>);
    renderPage();
    const [btn] = visible("Yayınla");
    expect(btn).toBeDisabled();
    expect(
      screen.getAllByRole("link", { name: "Doğrulamayı tamamlayın" })[0],
    ).toHaveAttribute("href", "/company/ayarlar/dogrulama");
  });

  it("Kazandır pasif + doğrulama ipucu", () => {
    h.detail = detail();
    renderPage();
    expect(screen.getByRole("button", { name: "Kazandır" })).toBeDisabled();
    expect(screen.getByText(/Kazandırma sipariş doğurur ve firma doğrulaması ister/)).toBeInTheDocument();
  });
});

describe("doğrulaması incelemedeki Gold firma (PENDING)", () => {
  beforeEach(() => {
    h.company = { id: "c1", country: "TR", tier: "GOLD", companyVerificationStatus: "PENDING" };
  });

  it("Yayınla pasif; 'Doğrulamayı tamamlayın' yerine bağlantısız inceleme notu", () => {
    h.detail = detail({ status: "DRAFT", canPublish: true, canEdit: true, bids: [] } as Partial<ListingDetail>);
    renderPage();
    expect(visible("Yayınla")[0]).toBeDisabled();
    expect(screen.queryByRole("link", { name: "Doğrulamayı tamamlayın" })).toBeNull();
    expect(screen.getAllByText(/Doğrulamanız inceleniyor/).length).toBeGreaterThan(0);
  });

  it("Kazandır pasif; inceleme notu, doğrulama bağlantısı yok", () => {
    h.detail = detail();
    renderPage();
    expect(screen.getByRole("button", { name: "Kazandır" })).toBeDisabled();
    expect(screen.queryByRole("link", { name: "Doğrulamayı tamamlayın" })).toBeNull();
    expect(screen.getByText(/Doğrulamanız inceleniyor/)).toBeInTheDocument();
  });
});

describe("onay isteğini iptal (D-252)", () => {
  it("talebi açmamış ama approvals:manage taşıyan yönetici 'Onayı İptal Et'i görür", () => {
    h.perms = ["buy:view", "approvals:manage"];
    h.detail = detail({
      createdById: "u2",
      status: "IN_AWARD_APPROVAL",
      pendingApprovalId: "ap1",
    } as Partial<ListingDetail>);
    renderPage();
    expect(visible("Onayı İptal Et")).toHaveLength(1);
  });

  it("ikisi de yoksa görmez", () => {
    h.perms = ["buy:view", "buy:listing:manage"];
    h.detail = detail({
      createdById: "u2",
      status: "IN_AWARD_APPROVAL",
      pendingApprovalId: "ap1",
    } as Partial<ListingDetail>);
    renderPage();
    expect(visible("Onayı İptal Et")).toHaveLength(0);
  });
});

describe("kalem bazlı kazandırma (O-090 / D-104)", () => {
  const twoItems = () =>
    detail({
      items: [
        { id: "i1", name: "Rulman", quantity: "10", unit: "adet" },
        { id: "i2", name: "Conta", quantity: "5", unit: "adet" },
      ],
      bids: [
        bid("b-exp", "Suresi Dolmus", { i1: "10", i2: "10" }, {
          submittedAt: new Date(Date.now() - 40 * DAY).toISOString(),
          validityDays: 7,
        }),
        bid("b-ok", "Gecerli Teklif", { i1: "20", i2: "20" }),
      ],
    } as unknown as Partial<ListingDetail>);

  it("süresi dolmuş teklif ön-seçilmez ve 'En iyi' rozeti almaz", async () => {
    h.detail = twoItems();
    renderPage();
    // En iyi rozeti geçerli teklifin satırında.
    const rows = screen.getAllByRole("link", { name: /Suresi Dolmus|Gecerli Teklif/ });
    const expRow = rows.find((r) => r.textContent === "Suresi Dolmus")!.parentElement!;
    const okRow = rows.find((r) => r.textContent === "Gecerli Teklif")!.parentElement!;
    expect(within(expRow).queryByText("En iyi")).toBeNull();
    expect(within(okRow).getByText("En iyi")).toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole("button", { name: "Kalem-bazlı Kazandır" }));
    const select = screen.getByRole("button", { name: "Rulman için kazanan teklif" });
    expect(select.textContent).toMatch(/Gecerli Teklif/);
    expect(select.textContent).not.toMatch(/Suresi Dolmus/);
  });

  it("kalem miktarını aşan kısmi miktar uyarı verir, ön kontrol çağrılmaz", async () => {
    h.detail = twoItems();
    renderPage();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Kalem-bazlı Kazandır" }));
    await user.type(
      screen.getByRole("spinbutton", { name: "Rulman için kazandırılacak miktar (boş = tam)" }),
      "400",
    );
    expect(screen.getByRole("alert")).toHaveTextContent(/En fazla/);
    await user.click(screen.getByRole("button", { name: "Onayla & Kazandır" }));
    expect(h.toast.error).toHaveBeenCalled();
    expect(h.preview).not.toHaveBeenCalled();
  });
});

describe("Gelen Teklifler satırı (D-107 / D-108 / D-109)", () => {
  it("kur TR ondalık virgülüyle, boşlukla ayrılmış", () => {
    h.detail = detail({
      bids: [
        bid("b1", "Dolar Teklif", { i1: "10" }, {
          currency: "USD",
          amountTry: "4901.84",
          exchangeRateSnapshot: "49.0184",
        }),
      ],
    } as unknown as Partial<ListingDetail>);
    renderPage();
    expect(screen.getByText(/ \(kur: 49,0184\)/)).toBeInTheDocument();
  });

  it("karşılaştırma başlığında firma adı büyük harfe çevrilmez", () => {
    h.detail = detail();
    renderPage();
    const th = screen.getAllByText("Canli Teklif").find((e) => e.closest("th"))!;
    expect(th.className).toMatch(/normal-case/);
  });

  it("?teklifler=incomplete süzgeci korunur; boş sonuçta metin", () => {
    h.search = "teklifler=incomplete";
    h.detail = detail();
    renderPage();
    expect(screen.getByRole("button", { name: "Eksik (0)" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Bu süzgece uyan teklif yok.")).toBeInTheDocument();
  });

  it("teklif detayı bağlantısı seçili süzgeci taşır", () => {
    h.search = "teklifler=complete";
    h.detail = detail();
    renderPage();
    expect(screen.getByRole("link", { name: "Canli Teklif" })).toHaveAttribute(
      "href",
      "/company/ilan/l1/teklif/b1?teklifler=complete",
    );
  });
});

describe("reddedilen sipariş (O-028)", () => {
  it("AWARDED talepte reddedilen sipariş, gerekçe ve tedariksiz kalemler bandı", () => {
    h.detail = detail({
      status: "AWARDED",
      items: [
        { id: "i1", name: "Rulman", quantity: "10", unit: "adet" },
        { id: "i2", name: "Conta", quantity: "5", unit: "adet" },
      ],
      bids: [
        bid("b1", "Kazanan Firma", { i1: "10" }, { status: "AWARDED_PARTIAL" }),
        bid("b2", "Reddeden Firma", { i2: "10" }, { status: "LOST" }),
      ],
      orders: [
        { id: "o1", number: "ORD-2026-0001", status: "PENDING", sellerCompanyId: "c-b1", rejectedReason: null, itemNames: ["Rulman"] },
        { id: "o2", number: "ORD-2026-0002", status: "REJECTED", sellerCompanyId: "c-b2", rejectedReason: "Stok yok", itemNames: ["Conta"] },
      ],
    } as unknown as Partial<ListingDetail>);
    renderPage();
    expect(screen.getByText(/Reddeden Firma, ORD-2026-0002 numaralı siparişi reddetti/)).toBeInTheDocument();
    expect(screen.getByText("Gerekçe: Stok yok")).toBeInTheDocument();
    expect(screen.getByText("Tedariksiz kalan kalemler: Conta")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Bu kalemlerle yeni talep oluştur" }).getAttribute("href")).toMatch(
      /taleplerim\/yeni\?from=l1&kalemler=i2$/,
    );
    expect(screen.queryByText(/Talep kazandırıldı — sipariş oluşturuldu/)).toBeNull();
  });
});
