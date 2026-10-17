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

  it("isteği başlatan, talep yönetme izni olmasa da görür (API cancelRequest: başlatan ∨ approvals:manage; arayüz testi T3)", () => {
    h.perms = ["buy:view"];
    h.detail = detail({
      createdById: "u2",
      status: "IN_APPROVAL",
      pendingApprovalId: "ap1",
      pendingApprovalMine: true,
    } as Partial<ListingDetail>);
    renderPage();
    expect(visible("Onayı İptal Et")).toHaveLength(1);
  });

  it("talebi yöneten ama isteği BAŞLATMAMIŞ kişi görmez (servis reddederdi; arayüz testi T3)", () => {
    h.perms = ["buy:view", "buy:listing:manage"];
    h.detail = detail({
      createdById: "u1",
      status: "IN_AWARD_APPROVAL",
      pendingApprovalId: "ap1",
      pendingApprovalMine: false,
    } as Partial<ListingDetail>);
    renderPage();
    expect(visible("Onayı İptal Et")).toHaveLength(0);
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
      screen.getByRole("textbox", { name: "Rulman için kazandırılacak miktar (boş = tam)" }),
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

  it("karşılaştırmada yabancı birimli kalem fiyatının TRY karşılığı hücrede (arayüz testi son tur S-BUY)", () => {
    h.detail = detail({
      bids: [
        bid("b1", "Dolar Teklif", { i1: "10" }, {
          currency: "USD",
          amountTry: "4901.84",
          exchangeRateSnapshot: "49.0184",
        }),
        bid("b2", "Lira Teklif", { i1: "450" }),
      ],
    } as unknown as Partial<ListingDetail>);
    renderPage();
    const eq = screen.getByText("≈ 490,18 ₺");
    expect(eq).toHaveAttribute("title", "Teklifin kur damgasıyla TRY karşılığı");
    expect(eq.closest("td")).toHaveTextContent("10,00 $");
    // TRY hücresinde karşılık satırı yok.
    const tryCell = screen.getAllByText("450,00 ₺").find((e) => e.closest("td"))!.closest("td")!;
    expect(tryCell.textContent).not.toMatch(/≈/);
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
    // Yeniden doğrulama webB-05: üst şerit canlı siparişi gösterir; reddedilen
    // sipariş yeşil şeritte öne çıkmaz.
    const strips = screen.getAllByTestId("order-strip");
    expect(strips).toHaveLength(1);
    expect(strips[0].textContent).toContain("ORD-2026-0001");
    expect(strips[0].className).toContain("emerald");
    expect(strips[0].querySelector("a")?.getAttribute("href")).toMatch(/\/company\/siparis\/o1$/);
  });

  it("canlı sipariş kalmadıysa şerit en yenisini nötr tonla gösterir", () => {
    h.detail = detail({
      status: "AWARDED",
      orders: [
        { id: "o2", number: "ORD-2026-0002", status: "REJECTED", sellerCompanyId: "c-b1", rejectedReason: null, itemNames: ["Rulman"] },
        { id: "o1", number: "ORD-2026-0001", status: "CANCELLED", sellerCompanyId: "c-b1", rejectedReason: null, itemNames: ["Rulman"] },
      ],
    } as unknown as Partial<ListingDetail>);
    renderPage();
    const strips = screen.getAllByTestId("order-strip");
    expect(strips).toHaveLength(1);
    expect(strips[0].textContent).toContain("ORD-2026-0002");
    expect(strips[0].className).not.toContain("emerald");
  });

  it("iki canlı siparişin ikisi de şeritte", () => {
    h.detail = detail({
      status: "AWARDED",
      orders: [
        { id: "o2", number: "ORD-2026-0002", status: "ACCEPTED", sellerCompanyId: "c-b2", rejectedReason: null, itemNames: ["Conta"] },
        { id: "o1", number: "ORD-2026-0001", status: "PENDING", sellerCompanyId: "c-b1", rejectedReason: null, itemNames: ["Rulman"] },
      ],
    } as unknown as Partial<ListingDetail>);
    renderPage();
    expect(screen.getAllByTestId("order-strip").map((el) => el.textContent?.includes("ORD-2026-000"))).toEqual([true, true]);
  });
});

describe("mobil denetim (g07 / g08)", () => {
  const twoBids = () =>
    detail({
      items: [{ id: "i1", name: "Rulman", quantity: "10", unit: "adet" }],
      bids: [
        bid("b1", "S46 AI Tedarik 44ES Ltd. Şti.", { i1: "48.5" }),
        bid("b2", "Diğer Tedarikçi", { i1: "50" }),
      ],
      invitations: [
        { rothernId: "AAAA-1111", companyName: "A" },
        { rothernId: "BBBB-2222", companyName: "B" },
      ],
    } as unknown as Partial<ListingDetail>);

  it("kalem bazlı kazandırmada seçici fiyatı ÖNDE gösterir, telefonda tam genişlik ve 44 px", async () => {
    h.detail = twoBids();
    renderPage();
    await userEvent.setup().click(screen.getByRole("button", { name: "Kalem-bazlı Kazandır" }));
    const select = screen.getByRole("button", { name: "Rulman için kazanan teklif" });
    // Ön-seçili en iyi teklif: fiyat firma adından önce (uzun ad fiyatı kesmesin).
    expect(select.textContent).toMatch(/^48,50 ₺ · S46 AI Tedarik/);
    const wrapper = select.parentElement!;
    const cls = wrapper.className.split(/\s+/);
    expect(cls).toContain("w-full");
    expect(cls).toContain("[&>button]:min-h-11");
    // Miktar + seçici telefonda alt alta, sm'den yan yana.
    expect(wrapper.parentElement!.className).toMatch(/flex-col.*sm:flex-row/);
    // Onay düğmesi tek satır kalır, satır sarabilir.
    const confirm = screen.getByRole("button", { name: "Onayla & Kazandır" });
    expect(confirm.className).toContain("whitespace-nowrap");
    expect(confirm.parentElement!.className.split(/\s+/)).toContain("flex-wrap");
  });

  it("teklif süzgeç hapları bölünmez, kap sarar", () => {
    h.detail = twoBids();
    renderPage();
    const pill = screen.getByRole("button", { name: /^Tümü/ });
    expect(pill.className.split(/\s+/)).toEqual(expect.arrayContaining(["whitespace-nowrap", "shrink-0"]));
    expect(pill.parentElement!.className.split(/\s+/)).toContain("flex-wrap");
  });

  it("teklif satırında Mesaj bağlantısı telefonda 44 px dokunma alanı taşır", () => {
    h.detail = twoBids();
    renderPage();
    const msg = screen.getAllByRole("link", { name: "Mesaj" })[0];
    expect(msg.className.split(/\s+/)).toEqual(expect.arrayContaining(["inline-flex", "min-h-11", "sm:min-h-0"]));
  });

  it("meta şeridinde Davetli değeri telefonda kırpılmaz (sarar)", () => {
    h.detail = twoBids();
    renderPage();
    const value = screen.getByText("2 tedarikçi");
    const cls = value.className.split(/\s+/);
    expect(cls).not.toContain("truncate");
    expect(cls).not.toContain("sm:@[9.25rem]:truncate");
    expect(cls).toContain("break-words");
  });

  it("meta şeridi: beş sütun yalnız şerit ≥ 54.5rem iken; tek satırlık değer yalnız yan yana düzende kırpılır", () => {
    h.detail = twoBids();
    renderPage();
    const cls = (el: Element | null) => (el?.getAttribute("class") ?? "").split(/\s+/);
    const davetli = screen.getByText("2 tedarikçi");
    const dl = davetli.closest("dl")!;
    expect(cls(dl)).toEqual(expect.arrayContaining(["grid-cols-2", "lg:grid-cols-3", "lg:@[54.5rem]:grid-cols-5"]));
    expect(cls(dl)).not.toContain("lg:grid-cols-5");
    expect(cls(dl.parentElement)).toContain("@container");
    // Teklif kutucuğu 2 ve 3 sütunda iki sütun kaplar, beşte bir.
    const teklif = screen.getByText("Teklif", { selector: "dl dt" }).closest('[data-slot="meta-item"]')!;
    expect(teklif.parentElement).toBe(dl);
    expect(cls(teklif)).toEqual(expect.arrayContaining(["@container", "col-span-2", "lg:@[54.5rem]:col-span-1"]));
    // Kalem sayısı: telefonda sarar, yan yana düzende (kutucuk ≥ 10.75rem =
    // içerik ≥ 9.25rem) tek satır + kırpma.
    const kalem = screen.getByText("1 kalem", { selector: "dl dd" });
    expect(cls(kalem)).toContain("sm:@[9.25rem]:truncate");
    expect(cls(kalem)).not.toContain("truncate");
    // Etiket hiçbir düzende kırpılmaz.
    expect(cls(screen.getByText("Davetli", { selector: "dl dt" }))).not.toContain("truncate");
    // axe `definition-list`: kutucukların çocukları YALNIZ dt / dd.
    for (const tile of dl.children) {
      expect(tile.tagName).toBe("DIV");
      expect([...tile.children].map((c) => c.tagName)).toEqual(["DT", "DT", "DD"]);
    }
  });

  // Mobil denetim fix3 r5-requests#new0: "Teklif Toplamı" etiket hücresi
  // sarmalayıcının nowrap'ini miras alıp yapışkan kalem sütununu RU 360'ta
  // 201 px'e zorluyordu; fiyatların başı kaydırınca bile sütunun altında
  // kalıyordu ("1 250,00 ₺" → "250,00 ₺"). Başlık, gövde ve toplam hücresi
  // aynı sınırı taşır: telefonda ≤ 10rem ve sarar, sm'den sınırsız.
  it("karşılaştırmada yapışkan kalem sütununun başlık / gövde / toplam hücreleri telefonda ≤ 10rem ve sarar", () => {
    h.detail = twoBids();
    renderPage();
    const cls = (el: Element | null) => (el?.getAttribute("class") ?? "").split(/\s+/);
    const total = screen.getByText("Teklif Toplamı").closest("td")!;
    const table = total.closest("table")!;
    const head = table.querySelector("thead th")!;
    const body = within(table).getByText("Rulman").closest("td")!;
    for (const cell of [head, body, total]) {
      expect(cls(cell)).toEqual(
        expect.arrayContaining(["sticky", "left-0", "max-w-[10rem]", "whitespace-normal", "break-words", "sm:max-w-none"]),
      );
      expect(cls(cell)).not.toContain("whitespace-nowrap");
    }
  });

  // Mobil denetim v-requests-products#new0: kalem sütununun yapışkan başlık /
  // toplam hücresi (z-20) aynı z'deki yapışkan eylem şeridinin üstüne
  // boyanıyordu (tablo DOM'da sonra gelir). Kart kendi yığın bağlamını kurar
  // (`isolate`): hücrelerin z'si yalnız kartın içinde sıralanır, kart şeridin
  // (z-20) altında kalır.
  it("karşılaştırma kartı yapışkan hücrelerin z'sini kendi içinde tutar (isolate) — eylem şeridini örtmez", () => {
    h.detail = twoBids();
    renderPage();
    const total = screen.getByText("Teklif Toplamı").closest("td")!;
    const card = total.closest(".card") as HTMLElement;
    expect(card.className.split(/\s+/)).toContain("isolate");
    // Kartın içindeki en yüksek z (kalem sütunu z-20) şeritten yüksek değil.
    const anchor = document.querySelector("[data-sticky-action-bar]") as HTMLElement;
    expect(anchor.className.split(/\s+/)).toContain("z-20");
    expect(card.contains(anchor)).toBe(false);
  });

  it("sahip görünümünde de yapışkan eylem şeridi akış dışında (h-0 çapa + absolute şerit)", () => {
    h.detail = twoBids();
    renderPage();
    const anchor = document.querySelector("[data-sticky-action-bar]") as HTMLElement;
    expect(anchor.className.split(/\s+/)).toEqual(expect.arrayContaining(["sticky", "top-(--topbar-h)", "h-0", "flow-root"]));
    const bar = anchor.firstElementChild as HTMLElement;
    expect(bar.className.split(/\s+/)).toEqual(expect.arrayContaining(["absolute", "inset-x-0", "top-0"]));
    expect(bar.className.split(/\s+/)).not.toContain("h-0");
  });

  it("tablo kartında gutter telefonda kart dolgusuna eşit (taşma yok)", () => {
    h.detail = twoBids();
    renderPage();
    const tables = screen.getAllByRole("table");
    for (const table of tables) {
      const card = table.closest(".card")!;
      const cls = card.className.split(/\s+/);
      expect(cls).toContain("[--gutter:--spacing(2)]");
      expect(cls).toContain("sm:[--gutter:--spacing(4)]");
      expect(cls).toContain("overflow-hidden");
    }
  });
});
