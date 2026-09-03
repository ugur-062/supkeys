// @vitest-environment jsdom
import { listingTerms } from "@/lib/company/terms";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  render as rtlRender,
  screen,
  waitForElementToBeRemoved,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SellerTenderRow } from "@/hooks/use-seller-tenders";

const h = vi.hoisted(() => ({
  rows: [] as unknown[],
  isLoading: false,
  isError: false,
  // Accordion'daki tembel kalem paneli (IhaleItemsPanel) bu uçtan fetch eder.
  get: vi.fn<(url: string) => Promise<{ data: unknown }>>(),
}));

vi.mock("@/hooks/use-seller-tenders", () => ({
  useSellerTenders: () => ({
    data: h.rows,
    isLoading: h.isLoading,
    isError: h.isError,
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
    masked: false,
    canBid: true,
    invited: true,
    connected: false,
    myBidStatus: null,
    myBidVersion: null,
    categoryMatch: false,
    categories: [{ code: "10000000", name: "Canlı Hayvanlar" }],
    extraCategoryCount: 0,
    minPrice: null,
    buyNowPrice: null,
    ...over,
  };
}

/** Satır sırası — her satırın kimlik kolonundaki başlık span'ının title'ı
 *  (BrowseTenderRow: ilk span[title] = ihale başlığı). */
function rowTitles(): (string | null)[] {
  return Array.from(document.querySelectorAll('[role="row"]')).map((r) =>
    r.querySelector("span[title]")?.getAttribute("title") ?? null,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  seq = 0;
  h.rows = [];
  h.isLoading = false;
  h.isError = false;
  h.get.mockResolvedValue({
    data: { id: "l1", items: [], itemCount: 0 },
  });
});

describe("SellerTendersView (yoğun satır görünümü)", () => {
  it("satır: durum rozeti + FİRMA + kapanış + teklifim; rozetler genişletmede", async () => {
    const user = userEvent.setup();
    h.rows = [
      row({ categoryMatch: true, myBidVersion: 2, myBidStatus: "SUBMITTED" }),
    ];
    render(<SellerTendersView />);

    // Başlık tırnaklı basılır → regex; firma adı düz.
    expect(screen.getByText(/Satın Alma Talebi 1/)).toBeInTheDocument();
    // Durum etiketi dikey rozet (md+) + mobil chip satırında — iki kopya normal.
    expect(screen.getAllByText("Teklif Gönderildi").length).toBeGreaterThanOrEqual(1);
    // Firma adı xl kolonu + mobil chip satırında — iki kopya normal.
    expect(screen.getAllByText("Alıcı A.Ş.").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("5 gün kaldı")).toBeInTheDocument();
    // Sağ uç metrik: benim teklifim (versiyonlu).
    expect(screen.getByText("Verildi · v2")).toBeInTheDocument();

    // Kategori artık KOLONDA da görünür (aksiyonların yerine, 2026-08-04) —
    // kolon + mobil chip; genişletmede rozet + kategori tekrar eder.
    expect(screen.getAllByText("Canlı Hayvanlar").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText("Kategorine Uygun")).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Detayı genişlet" }),
    );
    expect(screen.getByText("Kategorine Uygun")).toBeInTheDocument();
  });

  it("maskeli satır 'Gizli firma' + Premium çipi gösterir", () => {
    h.rows = [row({ masked: true, owner: null, canBid: false, invited: false })];
    render(<SellerTendersView />);
    // Firma kolonu + mobil chip satırı → en az bir "Gizli firma".
    expect(screen.getAllByText("Gizli firma").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Premium")).toBeInTheDocument();
  });

  it("varsayılan tab Aktif: geçmiş ilan gizli; Geçmiş'e geçince görünür", async () => {
    const user = userEvent.setup();
    h.rows = [
      row({ title: "Açık Satın Alma Talebi" }),
      row({ title: "Biten Satın Alma Talebi", status: "AWARDED", myBidStatus: "WON" }),
    ];
    render(<SellerTendersView />);

    // B10: sayfa başlığı artık "Açık Talepler" — regex başlığı da yakalar; exact string kullan.
    expect(screen.getByText("Açık Satın Alma Talebi")).toBeInTheDocument();
    expect(screen.queryByText(/Biten Satın Alma Talebi/)).not.toBeInTheDocument();

    // FilterSelect artık Listbox (P0): buton → seçenek tıklama.
    await user.click(screen.getByRole("button", { name: "Durum" }));
    await user.click(await screen.findByRole("option", { name: "Geçmiş" }));
    expect(screen.getByText(/Biten Satın Alma Talebi/)).toBeInTheDocument();
    expect(screen.queryByText("Açık Satın Alma Talebi")).not.toBeInTheDocument();
    expect(screen.getAllByText("Kazandınız").length).toBeGreaterThanOrEqual(1);
  });

  it("müşteri filtresi veriden türetilir ve uygulanır", async () => {
    const user = userEvent.setup();
    h.rows = [
      row({ owner: { id: "cx", name: "Firma X" }, title: "X'in satın alma talebi" }),
      row({ owner: { id: "cy", name: "Firma Y" }, title: "Y'nin satın alma talebi" }),
    ];
    render(<SellerTendersView />);

    await user.click(screen.getByRole("button", { name: "Müşteri" }));
    const listbox = await screen.findByRole("listbox");
    // Seçenek etiketi sayaçlı: "Firma X (1)".
    await user.click(within(listbox).getByText(/Firma X/));
    expect(screen.getByText(/X'in satın alma talebi/)).toBeInTheDocument();
    expect(screen.queryByText(/Y'nin satın alma talebi/)).not.toBeInTheDocument();
  });

  it("arama başlık/numara/alıcıda çalışır", async () => {
    const user = userEvent.setup();
    h.rows = [row({ title: "Çelik Boru Alımı" }), row({ title: "Kablo Alımı" })];
    render(<SellerTendersView />);

    await user.type(
      // Metin kayıt tipi sözlüğünden geliyor (lib/company/terms.ts) — testte
      // elle yazsaydık sözlük değiştiğinde bu test sözlükle ayrışırdı.
      screen.getByPlaceholderText(
        `${listingTerms("ACIK_TALEP").searchNoun} adı, numarası veya firma ara…`,
      ),
      "çelik",
    );
    // SearchInput debounce'lı (300ms) → filtrenin uygulanmasını bekle.
    await waitForElementToBeRemoved(() => screen.queryByText(/Kablo Alımı/));
    expect(screen.getByText(/Çelik Boru Alımı/)).toBeInTheDocument();
  });

  it("kategori eşleşen ilanlar her sıralamada üstte", () => {
    h.rows = [
      row({
        title: "Eşleşmeyen",
        closesAt: new Date(Date.now() + 1 * 86_400_000).toISOString(),
      }),
      row({
        title: "Eşleşen",
        categoryMatch: true,
        closesAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
      }),
    ];
    render(<SellerTendersView />);
    // Varsayılan sıralama "yakın biten" — ama eşleşen (30 gün) yine üstte.
    expect(rowTitles()).toEqual(["Eşleşen", "Eşleşmeyen"]);
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

  it("bağlantılı (davetsiz) ilanın genişletmesinde 'Bağlantılı' rozeti; davetlide gösterilmez", async () => {
    const user = userEvent.setup();
    h.rows = [row({ invited: false, connected: true })];
    const { unmount } = render(<SellerTendersView />);
    await user.click(screen.getByRole("button", { name: "Detayı genişlet" }));
    expect(screen.getByText("Bağlantılı")).toBeInTheDocument();
    unmount();

    // Davetli aynı zamanda bağlantılı olsa da 'Davetlisiniz' baskın rozet.
    h.rows = [row({ invited: true, connected: true })];
    render(<SellerTendersView />);
    await user.click(screen.getByRole("button", { name: "Detayı genişlet" }));
    expect(screen.getByText("Davetlisiniz")).toBeInTheDocument();
    expect(screen.queryByText("Bağlantılı")).not.toBeInTheDocument();
  });

  it("kalemler TEMBEL: satır açılana dek istek yok; açılınca detay ucundan gelir", async () => {
    const user = userEvent.setup();
    h.get.mockResolvedValue({
      data: {
        id: "l1",
        items: [
          {
            id: "i1",
            lineNo: 1,
            name: "Çelik Boru",
            description: null,
            quantity: "10",
            unit: "adet",
            targetPrice: null,
          },
        ],
        itemCount: 1,
      },
    });
    h.rows = [row()];
    render(<SellerTendersView />);

    // Liste yüklendi ama satır kapalı → kalem isteği YOK (tembel yükleme).
    expect(h.get).not.toHaveBeenCalled();

    const toggle = screen.getByRole("button", { name: "Detayı genişlet" });
    await user.click(toggle);
    expect(await screen.findByText("Çelik Boru")).toBeInTheDocument();
    expect(h.get).toHaveBeenCalledWith(
      "/company/listings/l1",
      expect.objectContaining({ signal: expect.anything() }),
    );
    // a11y: chevron aria-controls ile açılan paneli işaret eder.
    const panelId = toggle.getAttribute("aria-controls");
    expect(panelId).toBeTruthy();
    expect(document.getElementById(panelId!)).toBeInTheDocument();
  });

  it("satırda seçim kutusu YOK (kaldırıldı, 2026-08-03)", () => {
    h.rows = [row()];
    render(<SellerTendersView />);
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByText("Tümünü seç")).not.toBeInTheDocument();
  });

  it("boş durum + hata durumu", () => {
    h.rows = [];
    const { unmount } = render(<SellerTendersView />);
    expect(screen.getByText("Henüz açık talep yok")).toBeInTheDocument();
    unmount();

    h.isError = true;
    render(<SellerTendersView />);
    expect(screen.getByText("Açık talepler yüklenemedi.")).toBeInTheDocument();
  });
});
