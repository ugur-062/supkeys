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
vi.mock("@/hooks/use-seller-tenders", async (orig) => ({
  // `maskedRequestHref`/`maskedRowToSellerRow` gerçek — yalnız sorgu sahte.
  ...(await orig<typeof import("@/hooks/use-seller-tenders")>()),
  // Gerçek sorgu sözleşmesi: hiç okunamayan listede `data` undefined'dır
  // (durum geçişleri gerçek kancayla `seller-tenders-view-states.test.tsx`te).
  useSellerTenders: () => ({
    data: h.isLoading || h.isError ? undefined : h.rows,
    isLoading: h.isLoading,
    isPending: h.isLoading,
    isError: h.isError,
    refetch: vi.fn(),
  }),
}));
vi.mock("@/hooks/use-portal-discovery", () => ({
  useCategorySegments: () => ({
    data: [
      { id: "23000000", nameTr: "Endüstriyel Makineler" },
      { id: "39000000", nameTr: "Elektrik" },
    ],
  }),
}));
vi.mock("@/lib/company-auth/api", () => ({
  companyApi: { get: h.get },
}));

import { SellerTendersView } from "../seller-tenders-view";
import { maskedRowToSellerRow, type MaskedTenderApiRow } from "@/hooks/use-seller-tenders";
import { useCompanyAuthStore } from "@/lib/company-auth/store";

/** Firmanın efektif yetkisi/doğrulaması — liste ve satır CTA'ları store'dan okur. */
function setCompany(tier: string, companyVerificationStatus = "VERIFIED") {
  useCompanyAuthStore.setState({ company: { tier, companyVerificationStatus } as never });
}

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
    ownerCountry: "TR",
    canBid: true,
    invited: true,
    connected: false,
    myBidStatus: null,
    myBidSubmitCount: null,
    categoryMatch: false,
    categories: [{ code: "23000000", name: "Endüstriyel Makineler" }],
    extraCategoryCount: 0,
    ...over,
  };
}

/** API'nin maskeli satırı (herkese açık kart + panel sinyalleri) → liste satırı. */
function masked(over: Partial<MaskedTenderApiRow> = {}): SellerTenderRow {
  seq++;
  return maskedRowToSellerRow({
    masked: true,
    number: `ROT-9000${seq}`,
    slug: `rot-9000${seq}-talep`,
    type: "ALIM",
    title: `Herkese açık talep ${seq}`,
    status: "OPEN",
    closesAt: new Date(Date.now() + 10 * 86_400_000).toISOString(),
    publishedAt: new Date().toISOString(),
    primaryCurrency: "TRY",
    isInternational: false,
    targetCountries: [],
    itemCount: 2,
    itemSummary: { count: 2, totalQuantity: null, unit: null },
    company: { country: "TR", industry: "Metal", activities: [], verified: true },
    categories: [{ id: "39121501", name: "Kablo", level: 4 }],
    coverImageUrl: null,
    excerpt: null,
    format: "RFQ",
    itemNames: ["Bakır kablo"],
    categoryMatch: false,
    productMatch: false,
    matchedProduct: null,
    ...over,
  } as MaskedTenderApiRow);
}

/** Satır sırası — her satırın kimlik kolonundaki başlık span'ının title'ı. */
function rowTitles(): (string | null)[] {
  return Array.from(document.querySelectorAll('[data-liste-satiri="1"]')).map((r) =>
    r.querySelector("span[title]")?.getAttribute("title") ?? null,
  );
}
/** Masaüstü kenar süzgeci (mobil çekmece kapalıyken DOM'da yok). */
const sidebar = () => within(screen.getByRole("complementary", { name: "Süzgeçler" }));
// Grup başlığı daraltma düğmesinin İÇİNDE; düğmeden fieldset'e çıkılır
// (fieldset ayrıca aria-labelledby ile başlıktan adlanır — D-326).
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
  // Varsayılan tam yetkili (doğrulanmış) firma — doğrulanmamış senaryolar açıkça kurar.
  setCompany("SILVER");
  h.get.mockResolvedValue({
    data: { id: "l1", items: [], itemCount: 0 },
  });
});

describe("SellerTendersView (anasayfaya gömülü, kenar süzgeçli liste)", () => {
  it("satır: durum rozeti + FİRMA + kapanış + teklifim; rozetler genişletmede", async () => {
    const user = userEvent.setup();
    h.rows = [row({ categoryMatch: true, myBidSubmitCount: 2, myBidStatus: "SUBMITTED" })];
    render(<SellerTendersView />);

    expect(screen.getByRole("heading", { name: "Açık Talepler" })).toBeInTheDocument();
    expect(screen.getByText(/Satın Alma Talebi 1/)).toBeInTheDocument();
    expect(screen.getAllByText("Teklif Gönderildi").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Alıcı A.Ş.").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("5 gün kaldı").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Verildi · v2")).toBeInTheDocument();
    expect(screen.getAllByText("Endüstriyel Makineler").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Profilinizle eşleşti")).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: /^Detayları (göster|gizle)$/ }));
    expect(screen.getAllByText("Profilinizle eşleşti").length).toBeGreaterThanOrEqual(2);
    // Sıralama çipleri: varsayılan "Size uygun" basılı.
    expect(screen.getByRole("button", { name: "Size uygun" })).toHaveAttribute("aria-pressed", "true");
  });

  it("KENDİ arama kutusu YOK (hero'daki kutu arar); sayaç ve süzgeç grupları var", () => {
    h.rows = [row()];
    render(<SellerTendersView />);
    expect(screen.queryByRole("searchbox", { name: /adı, numarası/ })).toBeNull();
    expect(screen.getByText("1 açık talep bulundu")).toBeInTheDocument();
    expect(sidebar().getAllByRole("button", { name: /^(Uygunluk|Durum|Kategori|Kapanış|Alıcı|Alıcı ülkesi|Para birimi|Usul|Yayın tarihi)( ?\(\d+\))?$/ })).toHaveLength(9);
  });

  it("doğrulanmamış firma (2026-10-03): davetli/bağlantılı satırlar ÜSTTE, altında alıcı gizli herkese açık talepler; kilit kartı YOK", () => {
    setCompany("STANDART", "UNVERIFIED");
    h.rows = [
      row({ title: "Davetli talep", invited: true }),
      row({ title: "Bağlantılı talep", invited: false, connected: true }),
      masked({ title: "Maskeli eşleşen", categoryMatch: true }),
      masked({ title: "Maskeli diğer" }),
    ];
    render(<SellerTendersView />);
    expect(screen.getByText(/alıcı adı gizli — bunlara teklif firma doğrulamasıyla/)).toBeInTheDocument();
    // Büyük kilit kartı ve eski metin kalktı; paket adı hiçbir yerde yok (ücretsiz dönem 2026-10-07).
    expect(document.body.textContent).not.toMatch(/Silver|Gold|Platinum/);
    expect(document.querySelector('a[href*="/company/premium"]')).toBeNull();
    expect(screen.queryByText(/herkese açık taleplerin tamamı/)).toBeNull();

    const list = screen.getByRole("region", { name: /listesi/i });
    const order = Array.from(list.querySelectorAll('[data-liste-satiri="1"], [data-testid="masked-section"]')).map((el) =>
      el.getAttribute("data-testid") === "masked-section"
        ? "—etiket—"
        : (["Davetli talep", "Bağlantılı talep", "Maskeli eşleşen", "Maskeli diğer"].find((x) => el.textContent?.includes(x)) ?? "?"),
    );
    expect(order).toEqual(["Davetli talep", "Bağlantılı talep", "—etiket—", "Maskeli eşleşen", "Maskeli diğer"]);
    expect(screen.getByText("Herkese açık talepler · alıcı adı gizli")).toBeInTheDocument();

    // Maskeli satır: alıcı herkese açık sitedeki gibi — ad YOK, talebin açıldığı
    // ÜLKE (bayrak + ad; 2026-10-04, şehir yerine) + rozet.
    const maskedRow = Array.from(list.querySelectorAll('[data-liste-satiri="1"]')).find((el) =>
      el.textContent?.includes("Maskeli diğer"),
    )! as HTMLElement;
    // Etiket yalnız boşlukta sarılır (kilit simgesi son kelimeye bağlı) — tam metin title'da.
    expect(within(maskedRow).getByTitle("Alıcı gizli")).toBeInTheDocument();
    expect(within(maskedRow).getByText("Türkiye")).toBeInTheDocument();
    expect(maskedRow.querySelector('img[src="/flags/4x3/tr.svg"]')).not.toBeNull();
    expect(maskedRow.textContent).not.toContain("Bursa");
    // Rozet kısa metinle çizilir (TR "Doğrulanmış"), tam metin title'da.
    expect(within(maskedRow).getByTitle("Doğrulanmış alıcı")).toHaveTextContent("Doğrulanmış");
    expect(maskedRow.textContent).not.toContain("Alıcı A.Ş.");
    // CTA → doğrulama akışı; satır → panel içi maskeli görünüm.
    expect(within(maskedRow).getByRole("link", { name: "Teklif ver · doğrulama gerekir" })).toHaveAttribute(
      "href",
      "/company/ayarlar/dogrulama",
    );
    const hrefs = within(maskedRow).getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(hrefs.some((h) => h?.startsWith("/company/satis/acik-talep/ROT-9000"))).toBe(true);
    expect(hrefs.some((h) => h?.startsWith("/company/ilan/"))).toBe(false);
    // Genişletme paneli (tam detay ucunu okur) maskeli satırda yok.
    expect(within(maskedRow).queryByRole("button", { name: /^Detayları (göster|gizle)$/ })).toBeNull();
    // Sayaç iki grubu birlikte sayar.
    expect(screen.getByText("4 açık talep bulundu")).toBeInTheDocument();
  });

  it("doğrulanmamış firma: satır CTA'sı ve ince not DOĞRULAMAYA gider; not bağlantısı doğrulama durumunu izler", () => {
    setCompany("STANDART", "UNVERIFIED");
    h.rows = [masked({ title: "Maskeli" })];
    const first = render(<SellerTendersView />);
    expect(screen.getByRole("link", { name: "Teklif ver · doğrulama gerekir" })).toHaveAttribute("href", "/company/ayarlar/dogrulama");
    expect(screen.getByText(/Alıcının adını görmek ve teklif vermek için firma doğrulaması gerekir/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Firmanızı doğrulayın" })).toHaveAttribute("href", "/company/ayarlar/dogrulama");
    first.unmount();

    // İncelemede: yeniden başvuru istenmez, durum bağlantısı çizilir.
    setCompany("STANDART", "PENDING");
    render(<SellerTendersView />);
    expect(screen.queryByRole("link", { name: "Firmanızı doğrulayın" })).toBeNull();
    expect(screen.getByRole("link", { name: "Doğrulama durumunu gör" })).toHaveAttribute("href", "/company/ayarlar/dogrulama");
  });

  it("doğrulanmamış firma: sıralama grup İÇİNDE — maskeli satır yakın kapanışla davetlinin üstüne çıkmaz", () => {
    setCompany("STANDART", "UNVERIFIED");
    h.rows = [
      row({ title: "Davetli uzak", invited: true, closesAt: new Date(Date.now() + 30 * 86_400_000).toISOString() }),
      masked({ title: "Maskeli yakın", closesAt: new Date(Date.now() + 1 * 86_400_000).toISOString() }),
      masked({ title: "Maskeli orta", closesAt: new Date(Date.now() + 5 * 86_400_000).toISOString() }),
    ];
    h.search = "sirala=yakin";
    render(<SellerTendersView />);
    const texts = Array.from(document.querySelectorAll('[data-liste-satiri="1"]')).map((el) =>
      ["Davetli uzak", "Maskeli yakın", "Maskeli orta"].find((x) => el.textContent?.includes(x)),
    );
    expect(texts).toEqual(["Davetli uzak", "Maskeli yakın", "Maskeli orta"]);
  });

  it("doğrulanmamış firma: arama, kategori sayacı ve ALICI ÜLKESİ süzgeci maskeli satırları da kapsar (\"Teklif ver\"den ?q=ROT-…)", () => {
    setCompany("STANDART", "UNVERIFIED");
    h.rows = [
      row({ title: "Davetli talep" }),
      masked({ title: "Kablo talebi", number: "ROT-000478" }),
      masked({ title: "Alman maskeli", company: { country: "DE", industry: null, activities: [], verified: false } }),
    ];
    const { unmount } = render(<SellerTendersView />);
    // Kategori: maskeli satırlar "Elektrik" segmentine sayılır.
    expect(group("Kategori").getByLabelText(/^Elektrik/).closest("label")).toHaveTextContent("Elektrik2");
    // Alıcı ülkesi: maskeli satırın ülkesi de sayılır (TR = davetli + maskeli).
    expect(group("Alıcı ülkesi").getByLabelText(/^Almanya/).closest("label")).toHaveTextContent("Almanya1");
    expect(group("Alıcı ülkesi").getByLabelText(/^Türkiye/).closest("label")).toHaveTextContent("Türkiye2");
    unmount();

    h.search = "ulke=DE";
    const second = render(<SellerTendersView />);
    expect(screen.getByText(/Alman maskeli/)).toBeInTheDocument();
    expect(screen.queryByText(/Kablo talebi/)).toBeNull();
    second.unmount();

    h.search = "q=ROT-000478";
    render(<SellerTendersView />);
    expect(screen.getByText(/Kablo talebi/)).toBeInTheDocument();
    expect(screen.queryByText(/Davetli talep/)).toBeNull();
    expect(screen.getByText("1 açık talep bulundu")).toBeInTheDocument();
    expect(screen.queryByText("Sonuç bulunamadı.")).toBeNull();
  });

  it("doğrulanmış (tam yetkili) firma: maskeli bölüm ve kilit kartı yok; alt başlık tam yetkili metni", () => {
    h.rows = [row({})];
    render(<SellerTendersView />);
    expect(screen.queryByText(/doğrulama gerekir|firma doğrulaması gerekir/)).toBeNull();
    expect(document.querySelector('a[href="/company/ayarlar/dogrulama"]')).toBeNull();
    expect(screen.queryByTestId("masked-section")).toBeNull();
    expect(screen.getByText(/süzün, sıralayın, teklif verin/)).toBeInTheDocument();
  });

  it("arama boş: süzgeç boş durumu (eski 'kilitli sonuç yok' dalı kalktı)", () => {
    setCompany("STANDART", "UNVERIFIED");
    h.search = "q=ROT-000478";
    try {
      render(<SellerTendersView />);
      expect(screen.getByText("Süzgeçlerinizi değiştirerek tekrar deneyin.")).toBeInTheDocument();
      expect(screen.queryByText("Bu aramada size açık talep yok")).toBeNull();
    } finally {
      h.search = "";
    }
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

  it("geçmişte sayaç 'geçmiş talep' der; 200 tavanında '200+' ve bant (arayüz testi D-116)", () => {
    h.search = "durum=gecmis";
    h.rows = [
      row({ title: "Açık olan" }),
      ...Array.from({ length: 200 }, () => row({ status: "AWARDED", myBidStatus: "LOST" })),
    ];
    const { unmount } = render(<SellerTendersView />);
    expect(screen.getByText("200+ geçmiş talep bulundu")).toBeInTheDocument();
    expect(screen.queryByText(/açık talep bulundu/)).toBeNull();
    // Durum facet'i başlıkla AYNI alt sınırı yazar: Geçmiş 200+, Tümü 201+;
    // Aktif (1, tavan altı) kesin (yeniden doğrulama: facet "Geçmiş 200" diyordu).
    const pastRadio = screen.getAllByRole("radio", { name: /Geçmiş/ })[0]!;
    expect(pastRadio.closest("label")).toHaveTextContent(/200\+$/);
    const allRadio = screen.getAllByRole("radio", { name: /Tümü/ })[0]!;
    expect(allRadio.closest("label")).toHaveTextContent(/201\+$/);
    const activeRadio = screen.getAllByRole("radio", { name: /Aktif/ })[0]!;
    expect(activeRadio.closest("label")).toHaveTextContent(/1$/);
    expect(activeRadio.closest("label")).not.toHaveTextContent("+");
    expect(screen.getByText(/Geçmiş taleplerin en yeni 200'ü gösteriliyor/)).toBeInTheDocument();
    // Açık kapsamın tavanı (300) değil — o bant çıkmaz.
    expect(screen.queryByText(/En fazla 300/)).toBeNull();
    unmount();

    // Tavan altında kesin sayı, bant yok; "Tümü" genel "talep" der.
    h.search = "durum=tumu";
    h.rows = [row(), row({ status: "AWARDED", myBidStatus: "LOST" })];
    render(<SellerTendersView />);
    expect(screen.getByText("2 talep bulundu")).toBeInTheDocument();
    expect(screen.queryByText(/en yeni 200/)).toBeNull();
    expect(screen.getAllByRole("radio", { name: /Tümü/ })[0]!.closest("label")).not.toHaveTextContent("+");
  });

  it("eski WITHDRAWN teklif ham kodla değil 'Geri çekildi' etiketiyle görünür (arayüz testi D-275)", () => {
    h.rows = [row({ myBidStatus: "WITHDRAWN" })];
    render(<SellerTendersView />);
    expect(screen.getAllByText("Geri çekildi").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText(/WITHDRAWN/)).toBeNull();
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

  it("ALICI ÜLKESİ süzgeci alıcı şehri grubunun yerine (2026-10-04 sahip kararı): bayrak + yerel ad + sayı, URL'e ?ulke= yazar", async () => {
    const user = userEvent.setup();
    h.rows = [
      row({ title: "Yerli talep", ownerCountry: "TR" }),
      row({ title: "Alman talebi", ownerCountry: "DE" }),
    ];
    const { unmount } = render(<SellerTendersView />);
    // Şehir grubu YOK.
    expect(sidebar().queryByRole("button", { name: /^Alıcı şehri/ })).toBeNull();
    const almanya = group("Alıcı ülkesi").getByLabelText(/^Almanya/).closest("label")!;
    expect(almanya).toHaveTextContent("Almanya1");
    expect(almanya.querySelector('img[src="/flags/4x3/de.svg"]')).not.toBeNull();
    await user.click(group("Alıcı ülkesi").getByLabelText(/^Almanya/));
    expect(h.replace).toHaveBeenLastCalledWith("/company/satis?ulke=DE", { scroll: false });
    unmount();

    h.search = "ulke=DE";
    render(<SellerTendersView />);
    expect(screen.getByText(/Alman talebi/)).toBeInTheDocument();
    expect(screen.queryByText(/Yerli talep/)).not.toBeInTheDocument();
    // Aktif çip okuyucunun dilinde ülke adı (ham kod değil).
    expect(screen.getByRole("button", { name: /Almanya/ })).toBeInTheDocument();
  });

  it("eski ?sehir= bağlantısı yok sayılır: liste süzülmez, çip yok", () => {
    h.rows = [row({ title: "Yerli talep" }), row({ title: "Alman talebi", ownerCountry: "DE" })];
    h.search = "sehir=bursa";
    render(<SellerTendersView />);
    expect(screen.getByText(/Yerli talep/)).toBeInTheDocument();
    expect(screen.getByText(/Alman talebi/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /bursa/i })).toBeNull();
  });

  it("tek ülkeden gelen listede de alıcı ülkesi grubu çizilir (şehir grubunun yerini tutar)", () => {
    h.rows = [row({ ownerCountry: "TR" }), row({ ownerCountry: "TR" })];
    render(<SellerTendersView />);
    expect(group("Alıcı ülkesi").getByLabelText(/^Türkiye/).closest("label")).toHaveTextContent("Türkiye2");
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

  it("kategori süzgeci SEGMENT adıyla ve sayaçlı; kapanış/para/usul sayaçları", () => {
    h.rows = [
      row({ categories: [{ code: "39121501", name: "Kablo" }], isInternational: true, currency: "USD", format: "ENGLISH_AUCTION", closesAt: new Date(Date.now() + 2 * 86_400_000).toISOString() }),
      row(),
    ];
    render(<SellerTendersView />);
    expect(group("Kategori").getByLabelText(/^Elektrik/).closest("label")).toHaveTextContent("Elektrik1");
    expect(group("Kategori").getByLabelText(/^Endüstriyel Makineler/).closest("label")).toHaveTextContent("Endüstriyel Makineler1");
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
    await user.click(screen.getByRole("button", { name: /^Detayları (göster|gizle)$/ }));
    expect(screen.getAllByText("Bağlantılı")[0]).toBeInTheDocument();
    unmount();

    h.rows = [row({ invited: true, connected: true })];
    render(<SellerTendersView />);
    await user.click(screen.getByRole("button", { name: /^Detayları (göster|gizle)$/ }));
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
    const toggle = screen.getByRole("button", { name: /^Detayları (göster|gizle)$/ });
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
    // Liste artık adlandırılmış <section> (role="table" axe KRİTİK ihlaldi — yayın denetimi Bölüm 12).
    expect(within(screen.getByRole("region", { name: /listesi/i })).queryByRole("checkbox")).toBeNull();
    expect(screen.queryByText("Tümünü seç")).not.toBeInTheDocument();
  });

  it("sayfalama URL'de: 25 satırda ilk 20; ?sayfa=2 kalan 5", () => {
    h.rows = Array.from({ length: 25 }, () => row());
    const { unmount } = render(<SellerTendersView />);
    expect(document.querySelectorAll('[data-liste-satiri="1"]')).toHaveLength(20);
    unmount();
    h.search = "sayfa=2";
    render(<SellerTendersView />);
    expect(document.querySelectorAll('[data-liste-satiri="1"]')).toHaveLength(5);
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
