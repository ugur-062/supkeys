// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render as rtlRender, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SellerTenderRow } from "@/hooks/use-seller-tenders";

const h = vi.hoisted(() => ({
  rows: [] as unknown[],
  isLoading: false,
  isError: false,
  /** Ücretsiz üyenin kilit özeti — varsayılan paketli (kilit yok). */
  locked: { locked: false } as unknown,
  /** URL sorgusu — süzgeç durumu buradan okunur (`request-filter-params`). */
  search: "",
  replace: vi.fn(),
  // Accordion'daki tembel kalem paneli (IhaleItemsPanel) bu uçtan fetch eder.
  get: vi.fn<(url: string) => Promise<{ data: unknown }>>(),
}));

// Süzgeç durumu URL'de: bileşen `router.replace` ile yazar, `useSearchParams`
// ile okur. Testte URL değişmez — yazılan adres doğrulanır, okunacak durum
// `h.search` ile verilir.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: h.replace }),
  useSearchParams: () => new URLSearchParams(h.search),
  usePathname: () => "/company/satis",
}));
vi.mock("@/hooks/use-seller-tenders", () => ({
  useSellerTenders: () => ({
    data: h.rows,
    isLoading: h.isLoading,
    isError: h.isError,
    refetch: vi.fn(),
  }),
  useLockedRequestsSummary: () => ({ data: h.locked }),
}));
vi.mock("@/hooks/use-portal-discovery", () => ({
  useCategorySegments: () => ({
    data: [
      { id: "10000000", nameTr: "Canlı Hayvanlar" },
      { id: "39000000", nameTr: "Elektrik" },
    ],
  }),
}));
vi.mock("@/lib/company-auth/api", () => ({
  companyApi: { get: h.get },
}));

import { SellerTendersView } from "../seller-tenders-view";

// Kalem paneli useQuery kullanır → QueryClient şart.
const render = (ui: React.ReactElement) =>
  rtlRender(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {ui}
    </QueryClientProvider>,
  );

let seq = 0;
function row(over: Partial<SellerTenderRow> = {}): SellerTenderRow {
  seq++;
  return {
    id: `l${seq}`,
    number: `ROT-2026-000${seq}`,
    title: `Satın Alma Talebi ${seq}`,
    status: "OPEN",
    visibility: "CONNECTIONS",
    format: "RFQ",
    currency: "TRY",
    isInternational: false,
    closesAt: new Date(Date.now() + 5 * 86_400_000).toISOString(),
    createdAt: new Date().toISOString(),
    itemCount: 3,
    owner: { id: "buyer-1", name: "Alıcı A.Ş." },
    ownerCity: "Bursa",
    canBid: true,
    invited: true,
    connected: false,
    myBidStatus: null,
    myBidVersion: null,
    categoryMatch: false,
    categories: [{ code: "10000000", name: "Canlı Hayvanlar" }],
    extraCategoryCount: 0,
    ...over,
  };
}

/** Satır sırası — her satırın kimlik kolonundaki başlık span'ının title'ı. */
function rowTitles(): (string | null)[] {
  return Array.from(document.querySelectorAll('[role="row"]')).map((r) =>
    r.querySelector("span[title]")?.getAttribute("title") ?? null,
  );
}
/** Masaüstü kenar süzgeci (mobil çekmece kapalıyken DOM'da yok). */
const sidebar = () => within(screen.getByRole("complementary", { name: "Süzgeçler" }));
// Grup başlığı <legend> daraltma düğmesinin İÇİNDE (display: contents) —
// fieldset'in erişilebilir adı legend'dan türemez; düğmeden fieldset'e çık.
const group = (name: string) =>
  within(
    sidebar()
      .getByRole("button", { name: new RegExp(`^${name}( ?\\(\\d+\\))?$`) })
      .closest("fieldset")!,
  );

beforeEach(() => {
  vi.clearAllMocks();
  seq = 0;
  h.rows = [];
  h.isLoading = false;
  h.isError = false;
  h.search = "";
  h.get.mockResolvedValue({
    data: { id: "l1", items: [], itemCount: 0 },
  });
});

describe("SellerTendersView (anasayfaya gömülü, kenar süzgeçli liste)", () => {
  it("satır: durum rozeti + FİRMA + kapanış + teklifim; rozetler genişletmede", async () => {
    const user = userEvent.setup();
    h.rows = [row({ categoryMatch: true, myBidVersion: 2, myBidStatus: "SUBMITTED" })];
    render(<SellerTendersView />);

    expect(screen.getByRole("heading", { name: "Açık Talepler" })).toBeInTheDocument();
    expect(screen.getByText(/Satın Alma Talebi 1/)).toBeInTheDocument();
    expect(screen.getAllByText("Teklif Gönderildi").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Alıcı A.Ş.").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("5 gün kaldı").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Verildi · v2")).toBeInTheDocument();
    expect(screen.getAllByText("Canlı Hayvanlar").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Profilinizle eşleşti")).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Kalemler" }));
    expect(screen.getAllByText("Profilinizle eşleşti").length).toBeGreaterThanOrEqual(2);
    // Sıralama çipleri: varsayılan "Size uygun" basılı.
    expect(screen.getByRole("button", { name: "Size uygun" })).toHaveAttribute("aria-pressed", "true");
  });

  it("KENDİ arama kutusu YOK (hero'daki kutu arar); sayaç ve süzgeç grupları var", () => {
    h.rows = [row()];
    render(<SellerTendersView />);
    expect(screen.queryByRole("searchbox", { name: /adı, numarası/ })).toBeNull();
    expect(screen.getByText("1 açık talep bulundu")).toBeInTheDocument();
    expect(sidebar().getAllByRole("button", { name: /^(Uygunluk|Durum|Kategori|Kapsam|Kapanış|Alıcı|Alıcı şehri|Para birimi|Usul|Yayın tarihi)( ?\(\d+\))?$/ })).toHaveLength(10);
  });

  it("ücretsiz üye: kilit kartı GERÇEK sayıları ve bulanık örnekleri gösterir, CTA paket sayfası (2026-09-06)", () => {
    h.locked = {
      locked: true,
      total: 12,
      inMyCategories: 4,
      thisWeek: 3,
      itemCount: 40,
      samples: [{ title: "Çelik boru alımı", category: "Borular", itemCount: 3, closesAt: null, city: "Bursa", isInternational: false }],
    };
    try {
      render(<SellerTendersView />);
      expect(screen.getByText("Silver ile açılacak 12 açık talep")).toBeInTheDocument();
      expect(screen.getByText("4 kategorinizde · 3 bu hafta yeni · toplam 40 kalem")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Silver paketine geç" })).toHaveAttribute("href", "/nasil-calisir#fiyatlar");
      expect(screen.getByText(/herkese açık taleplerin tamamı Silver paketiyle açılır/)).toBeInTheDocument();
    } finally {
      h.locked = { locked: false };
    }
  });

  it("paketli üye: kilit kartı çizilmez", () => {
    h.rows = [row({})];
    render(<SellerTendersView />);
    expect(screen.queryByText(/Silver ile açılacak/)).toBeNull();
  });

  it("durum: varsayılan Aktif geçmişi gizler; ?durum=gecmis ile görünür; radyo tıklanınca URL yazılır", async () => {
    const user = userEvent.setup();
    h.rows = [
      row({ title: "Açık Satın Alma Talebi" }),
      row({ title: "Biten Satın Alma Talebi", status: "AWARDED", myBidStatus: "WON" }),
    ];
    const { unmount } = render(<SellerTendersView />);
    expect(screen.getByText("Açık Satın Alma Talebi")).toBeInTheDocument();
    expect(screen.queryByText(/Biten Satın Alma Talebi/)).not.toBeInTheDocument();
    // Sayaçlar bağlamsal: Durum grubu kendisi hariç sayar → Aktif 1 · Geçmiş 1 · Tümü 2.
    const durum = group("Durum");
    expect(durum.getByLabelText(/^Aktif/)).toBeChecked();
    expect(durum.getByLabelText(/^Geçmiş/).closest("label")).toHaveTextContent("Geçmiş1");
    expect(durum.getByLabelText(/^Tümü/).closest("label")).toHaveTextContent("Tümü2");
    await user.click(durum.getByLabelText(/^Geçmiş/));
    expect(h.replace).toHaveBeenLastCalledWith("/company/satis?durum=gecmis", { scroll: false });
    unmount();

    h.search = "durum=gecmis";
    render(<SellerTendersView />);
    expect(screen.getByText(/Biten Satın Alma Talebi/)).toBeInTheDocument();
    expect(screen.queryByText("Açık Satın Alma Talebi")).not.toBeInTheDocument();
    expect(screen.getAllByText("Kazandınız").length).toBeGreaterThanOrEqual(1);
    // Aktif çip + "Tümünü temizle".
    expect(screen.getByRole("button", { name: /Durum: Geçmiş/ })).toBeInTheDocument();
  });

  it("alıcı süzgeci veriden türetilir (sayaçlı) ve URL ile uygulanır", async () => {
    const user = userEvent.setup();
    h.rows = [
      row({ owner: { id: "cx", name: "Firma X" }, title: "X'in satın alma talebi" }),
      row({ owner: { id: "cy", name: "Firma Y" }, title: "Y'nin satın alma talebi" }),
      row({ owner: { id: "cy", name: "Firma Y" }, title: "Y'nin ikinci talebi" }),
    ];
    const { unmount } = render(<SellerTendersView />);
    const alici = group("Alıcı");
    // En çok talebi olan önde.
    const labels = alici.getAllByRole("checkbox").map((c) => c.closest("label")?.textContent);
    expect(labels).toEqual(["Firma Y2", "Firma X1"]);
    await user.click(alici.getByLabelText(/^Firma X/));
    expect(h.replace).toHaveBeenLastCalledWith("/company/satis?alici=cx", { scroll: false });
    unmount();

    h.search = "alici=cx";
    render(<SellerTendersView />);
    expect(screen.getByText(/X'in satın alma talebi/)).toBeInTheDocument();
    expect(screen.queryByText(/Y'nin satın alma talebi/)).not.toBeInTheDocument();
    // Bağlamsal sayaç: alıcı grubu kendisi hariç sayar → Y hâlâ 2 gösterir.
    expect(group("Alıcı").getByLabelText(/^Firma Y/).closest("label")).toHaveTextContent("Firma Y2");
    expect(screen.getByRole("button", { name: /Firma X/ })).toBeInTheDocument();
  });

  it("arama URL'den (?q=) uygulanır ve çip olarak kaldırılabilir", async () => {
    const user = userEvent.setup();
    h.rows = [row({ title: "Çelik Boru Alımı" }), row({ title: "Kablo Alımı" })];
    h.search = "q=%C3%A7elik";
    render(<SellerTendersView />);
    expect(screen.getByText(/Çelik Boru Alımı/)).toBeInTheDocument();
    expect(screen.queryByText(/Kablo Alımı/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Arama: "çelik"/ }));
    expect(h.replace).toHaveBeenLastCalledWith("/company/satis", { scroll: false });
  });

  it("kategori süzgeci SEGMENT adıyla ve sayaçlı; kapsam/kapanış/para/usul sayaçları", () => {
    h.rows = [
      row({ categories: [{ code: "39121501", name: "Kablo" }], isInternational: true, currency: "USD", format: "ENGLISH_AUCTION", closesAt: new Date(Date.now() + 2 * 86_400_000).toISOString() }),
      row(),
    ];
    render(<SellerTendersView />);
    expect(group("Kategori").getByLabelText(/^Elektrik/).closest("label")).toHaveTextContent("Elektrik1");
    expect(group("Kategori").getByLabelText(/^Canlı Hayvanlar/).closest("label")).toHaveTextContent("Canlı Hayvanlar1");
    expect(group("Kapsam").getByLabelText(/^Uluslararası/).closest("label")).toHaveTextContent("Uluslararası1");
    expect(group("Kapanış").getByLabelText(/^3 gün içinde/).closest("label")).toHaveTextContent("3 gün içinde1");
    expect(group("Para birimi").getByLabelText(/^USD/).closest("label")).toHaveTextContent("USD1");
    expect(group("Usul").getByLabelText(/^Pazarlık/).closest("label")).toHaveTextContent("Pazarlık1");
    // Sayısı 0 olan seçenek devre dışı (seçili değilse).
    expect(group("Kapanış").getByLabelText(/^7 gün içinde/)).not.toBeDisabled();
    expect(group("Uygunluk").getByLabelText(/^Teklif verdiklerim/)).toBeDisabled();
  });

  it("kategori eşleşen ilanlar her sıralamada üstte", () => {
    h.rows = [
      row({ title: "Eşleşmeyen", closesAt: new Date(Date.now() + 1 * 86_400_000).toISOString() }),
      row({ title: "Eşleşen", categoryMatch: true, closesAt: new Date(Date.now() + 30 * 86_400_000).toISOString() }),
    ];
    h.search = "sirala=yakin";
    render(<SellerTendersView />);
    expect(rowTitles()).toEqual(["Eşleşen", "Eşleşmeyen"]);
    expect(screen.getByRole("button", { name: "Yakın biten" })).toHaveAttribute("aria-pressed", "true");
  });

  it("öncelik sırası: davetli > bağlantılı > kategori > gerisi", () => {
    h.rows = [
      row({ title: "Gerisi", invited: false, connected: false, categoryMatch: false }),
      row({ title: "Kategori", invited: false, connected: false, categoryMatch: true }),
      row({ title: "Bağlantılı", invited: false, connected: true, categoryMatch: false }),
      row({ title: "Davetli", invited: true, connected: false, categoryMatch: false }),
    ];
    render(<SellerTendersView />);
    expect(rowTitles()).toEqual(["Davetli", "Bağlantılı", "Kategori", "Gerisi"]);
  });

  it("uygunluk süzgeci grup içi VEYA (?uygunluk=davet,baglanti)", () => {
    h.rows = [
      row({ title: "Gerisi", invited: false, connected: false }),
      row({ title: "Bağlantılı", invited: false, connected: true }),
      row({ title: "Davetli", invited: true, connected: false }),
    ];
    h.search = "uygunluk=davet,baglanti";
    render(<SellerTendersView />);
    expect(rowTitles()).toEqual(["Davetli", "Bağlantılı"]);
    expect(screen.getByRole("button", { name: /Davet edildim/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Bağlantılı alıcı/ })).toBeInTheDocument();
  });

  it("bağlantılı (davetsiz) ilanın genişletmesinde 'Bağlantılı' rozeti; davetlide gösterilmez", async () => {
    const user = userEvent.setup();
    h.rows = [row({ invited: false, connected: true })];
    const { unmount } = render(<SellerTendersView />);
    await user.click(screen.getByRole("button", { name: "Kalemler" }));
    expect(screen.getAllByText("Bağlantılı")[0]).toBeInTheDocument();
    unmount();

    h.rows = [row({ invited: true, connected: true })];
    render(<SellerTendersView />);
    await user.click(screen.getByRole("button", { name: "Kalemler" }));
    expect(screen.getByText("Davetlisiniz")).toBeInTheDocument();
    expect(screen.queryByText("Bağlantılı")).not.toBeInTheDocument();
  });

  it("kalemler TEMBEL: satır açılana dek istek yok; açılınca detay ucundan gelir", async () => {
    const user = userEvent.setup();
    h.get.mockResolvedValue({
      data: {
        id: "l1",
        items: [{ id: "i1", lineNo: 1, name: "Çelik Boru", description: null, quantity: "10", unit: "adet", targetPrice: null }],
        itemCount: 1,
      },
    });
    h.rows = [row()];
    render(<SellerTendersView />);
    expect(h.get).not.toHaveBeenCalled();
    const toggle = screen.getByRole("button", { name: "Kalemler" });
    await user.click(toggle);
    expect(await screen.findByText("Çelik Boru")).toBeInTheDocument();
    expect(h.get).toHaveBeenCalledWith("/company/listings/l1", expect.objectContaining({ signal: expect.anything() }));
    const panelId = toggle.getAttribute("aria-controls");
    expect(panelId).toBeTruthy();
    expect(document.getElementById(panelId!)).toBeInTheDocument();
  });

  it("satırda seçim kutusu YOK (kaldırıldı, 2026-08-03) — kutular yalnız kenar süzgecinde", () => {
    h.rows = [row()];
    render(<SellerTendersView />);
    expect(within(screen.getByRole("table")).queryByRole("checkbox")).toBeNull();
    expect(screen.queryByText("Tümünü seç")).not.toBeInTheDocument();
  });

  it("sayfalama URL'de: 25 satırda ilk 20; ?sayfa=2 kalan 5", () => {
    h.rows = Array.from({ length: 25 }, () => row());
    const { unmount } = render(<SellerTendersView />);
    expect(document.querySelectorAll('[role="row"]')).toHaveLength(20);
    unmount();
    h.search = "sayfa=2";
    render(<SellerTendersView />);
    expect(document.querySelectorAll('[role="row"]')).toHaveLength(5);
  });

  it("boş durum (süzgeçli → Filtreleri temizle URL'yi sıfırlar) + hata durumu", async () => {
    const user = userEvent.setup();
    h.rows = [];
    let r = render(<SellerTendersView />);
    expect(screen.getByText("Aktif açık talep yok.")).toBeInTheDocument();
    expect(screen.getByText("Kapananlar için Durum → Geçmiş.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Satış kategorilerini düzenle" })).toBeInTheDocument();
    expect(screen.queryByText("Bağlantı Kur")).not.toBeInTheDocument();
    r.unmount();

    h.rows = [row()];
    h.search = "q=yok&sirala=yeni";
    r = render(<SellerTendersView />);
    expect(screen.getByText("Sonuç bulunamadı.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Filtreleri temizle" }));
    // Arama dahil sıfırlanır, sıralama kalır.
    expect(h.replace).toHaveBeenLastCalledWith("/company/satis?sirala=yeni", { scroll: false });
    r.unmount();

    h.search = "";
    h.isError = true;
    render(<SellerTendersView />);
    expect(screen.getByText("Açık talepler yüklenemedi.")).toBeInTheDocument();
  });
});
