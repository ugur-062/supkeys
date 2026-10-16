// @vitest-environment jsdom
/**
 * Talep detayı — teklif veren görünümü (arayüz testi webB-06):
 *  · O-037/D-278: kalem hücresinde marka · parça no, "Muadil kabul edilmez",
 *    istenen teslim tarihi; sorular dokunarak açılan panelde.
 *  · D-176: kapanışsız açık talepte başlık kartında "Teklif Ver".
 *  · D-195: tamamlanmış talepte rol uyarısı yok.
 *  · D-278: alıcının iç "Kazandırma Onayı" durumu teklif verene "Değerlendirmede".
 *  · D-024: 404'te satınalma izni olmayan üyeye kendi-firma notu, "Tekrar dene" yok.
 */
import type { ListingDetail } from "@/hooks/use-company-listings";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  detail: undefined as unknown,
  error: null as unknown,
  /** Verisi olan sorgunun arka plan yoklaması düştü (`data` dolu, `isError` true). */
  keepData: false,
  /** Çevrimdışı duraklama: istek yok, hata yok, veri yok. */
  paused: false,
  perms: [] as string[],
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "l1" }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/company/ilan/l1",
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));
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
  useCompanyAuth: () => ({
    user: { id: "u2" },
    company: { id: "c2", country: "TR", tier: "SILVER", companyVerificationStatus: "VERIFIED" },
  }),
  useHasCompanyPermission: (p: string) => h.perms.includes(p),
}));
vi.mock("@/lib/company-auth/store", () => ({
  useCompanyAuthStore: (sel: (s: unknown) => unknown) =>
    sel({ user: { id: "u2", permissions: h.perms }, company: { id: "c2", country: "TR" } }),
}));
vi.mock("@/hooks/use-company-approvals", () => ({
  useCancelApproval: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/use-company-listings", async (importOriginal) => {
  const mod = await importOriginal<Record<string, unknown>>();
  return {
    ...mod,
    useListingDetail: () => ({
      data: h.paused || (h.error && !h.keepData) ? undefined : h.detail,
      isLoading: false,
      isPending: h.paused,
      isFetching: false,
      isError: !!h.error,
      error: h.error,
      refetch: vi.fn(),
    }),
  };
});

import ListingDetailPage from "../page";

function detail(over: Partial<ListingDetail> = {}): ListingDetail {
  return {
    id: "l1",
    number: "ROT-2026-0002",
    type: "ALIM",
    title: "Vana Alımı",
    status: "OPEN",
    format: "RFQ",
    isOwner: false,
    canBid: true,
    roleAllowsBid: true,
    invited: true,
    primaryCurrency: "TRY",
    allowedCurrencies: [],
    categoryIds: [],
    targetCountries: [],
    closesAt: new Date(Date.now() + 3 * 86_400_000).toISOString(),
    owner: { id: "c1", name: "Alıcı AŞ" },
    items: [
      {
        id: "i1",
        lineNo: 1,
        name: "Küresel Vana",
        description: null,
        quantity: "10",
        unit: "adet",
        targetPrice: null,
        brand: "Valfsan",
        mpn: "KV-50",
        alternativeAllowed: false,
        requiredByDate: "2026-11-20T00:00:00.000Z",
        questions: [
          { id: "q1", text: "Sertifika var mı?", answerType: "YES_NO", required: true },
          { id: "q2", text: "Menşei nedir?", answerType: "TEXT", required: false },
        ],
      },
    ],
    myBid: null,
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

beforeEach(() => {
  h.detail = detail();
  h.error = null;
  h.keepData = false;
  h.paused = false;
  h.perms = ["sell:view", "sell:bid:submit"];
});

describe("teklif veren talep detayı — kalem bilgileri (O-037 / D-278)", () => {
  it("marka · parça no, muadil kapalı rozeti ve istenen teslim tarihi görünür", () => {
    renderPage();
    // Satır tek metin okunur; parça no (kod) ayrı nowrap öğede — kalem adı
    // hücresi her genişlikte sardığı için "KV-" / "50" diye bölünmez (fix3).
    const line = screen.getByText(
      (_, el) => el?.tagName === "DIV" && el.textContent === "Marka / Parça no: Valfsan · KV-50",
    );
    expect(within(line).getByText("KV-50").className.split(/\s+/)).toContain("whitespace-nowrap");
    expect(screen.getByText("Muadil kabul edilmez")).toBeInTheDocument();
    expect(screen.getByText(/^İstenen teslim: 20 Kas 2026/)).toBeInTheDocument();
  });

  it("sorular title ipucunda değil, dokunarak açılan panelde", () => {
    renderPage();
    const summary = screen.getByText("2 soru").closest("summary")!;
    expect(summary).toBeInTheDocument();
    const details = summary.closest("details")!;
    expect(within(details).getByText("Sertifika var mı?")).toBeInTheDocument();
    expect(within(details).getByText("Menşei nedir?")).toBeInTheDocument();
    expect(within(details).getByText("(zorunlu)")).toBeInTheDocument();
    expect(details.querySelector("[title]")).toBeNull();
  });
});

describe("teklif veren başlık kartı", () => {
  it("kapanışı olmayan açık talepte de 'Teklif Ver' başlık kartında (D-176)", () => {
    h.detail = detail({ closesAt: null } as Partial<ListingDetail>);
    renderPage();
    // Yapışkan çubuk (başlık görünürken gizli) + başlık kartı = iki CTA.
    expect(screen.getAllByRole("link", { name: /Teklif Ver/ })).toHaveLength(2);
  });

  it("alıcının 'Kazandırma Onayı' durumu teklif verene 'Değerlendirmede' görünür (D-278)", () => {
    h.detail = detail({ status: "IN_AWARD_APPROVAL" });
    renderPage();
    expect(screen.queryByText("Kazandırma Onayı")).toBeNull();
    expect(screen.getAllByText("Değerlendirmede").length).toBeGreaterThan(0);
  });

  it("yapışkan çubukta kapanış tarihi metne girer — çıplak 'Kapanış' değil (yeniden doğrulama)", () => {
    h.detail = detail({ closesAt: "2026-11-04T09:30:00.000Z" } as Partial<ListingDetail>);
    renderPage();
    expect(screen.getByText(/^Kapanış: .*2026/)).toBeInTheDocument();
  });

  it("değerlendirmedeki talepte 'Teklif alımı kapandı' hapı ızgarada gerilmez (yeniden doğrulama)", () => {
    h.detail = detail({ status: "IN_AWARD" });
    renderPage();
    const pill = screen.getByText(/Teklif alımı kapandı/);
    expect(pill.className).toContain("self-start");
    expect(pill.className).toContain("justify-self-start");
  });

  it("tamamlanmış talepte teklif rolü uyarısı gösterilmez (D-195)", () => {
    h.perms = ["sell:view"];
    h.detail = detail({
      status: "AWARDED",
      roleAllowsBid: false,
      myBid: { amount: "1000", status: "WON", version: 1, note: null },
    } as Partial<ListingDetail>);
    renderPage();
    expect(screen.queryByText(/Teklif verme/)).toBeNull();
  });

  it("açık talepte rol uyarısı yine görünür — rol etiketi değil eksik izni söyler (arayüz testi T3)", () => {
    h.perms = ["sell:view"];
    h.detail = detail({ roleAllowsBid: false });
    renderPage();
    expect(screen.getByText("Teklif verme")).toBeInTheDocument();
    expect(screen.getByText(/yetkisi gerekir/)).toBeInTheDocument();
    expect(screen.queryByText(/Satışçı/)).toBeNull();
  });
});

describe("kapalı zarf bandı (canlı öncesi)", () => {
  it("teklif verene kapanıştan sonra açılma vaadi vermez — teklifi yalnız alıcının gördüğünü söyler", () => {
    renderPage();
    expect(screen.getByText("Kapalı zarf: diğer tekliflerin tutarını göremezsiniz.")).toBeInTheDocument();
    expect(
      screen.getByText("Teklifinizi diğer tedarikçiler hiçbir zaman göremez; yalnız alıcı firma görür."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/kapanış tarihinden sonra/)).toBeNull();
  });
});

describe("talebe ulaşılamıyor (D-024)", () => {
  it("404'te 'Tekrar dene' yok; satınalma izni olmayan üyeye kendi-firma notu", () => {
    h.error = { response: { status: 404 } };
    renderPage();
    expect(screen.getByText("Talebe ulaşılamıyor.")).toBeInTheDocument();
    expect(screen.getByText(/kendi firmanıza aitse/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Tekrar dene" })).toBeNull();
  });

  it("satınalma izni olan üyeye kendi-firma notu gösterilmez", () => {
    h.error = { response: { status: 404 } };
    h.perms = ["buy:view", "sell:view"];
    renderPage();
    expect(screen.queryByText(/kendi firmanıza aitse/)).toBeNull();
  });
});

describe("arka plan yoklaması ve bekleme (canlı doğrulama 2026-10-09 taraması)", () => {
  // Açık talep 10 sn'de bir yoklanır; kesintide sayfanın tamamı "Talep
  // yüklenemedi"ye dönüyor, kullanıcı okuduğu talebi kaybediyordu.
  it.each([{ message: "Network Error" }, { response: { status: 503 } }, { response: { status: 429 } }])(
    "yoklama kesintide düşünce (%o) ekrandaki talep kalır",
    (error) => {
      h.keepData = true;
      h.error = error;
      renderPage();
      expect(screen.queryByText("Talep yüklenemedi.")).toBeNull();
      expect(screen.queryByText("Talebe ulaşılamıyor.")).toBeNull();
      expect(screen.getAllByText((h.detail as ListingDetail).title).length).toBeGreaterThan(0);
    },
  );

  it("API'nin 404 yanıtı eldeki veriyi de geçersiz kılar: 'Talebe ulaşılamıyor' kartı", () => {
    h.keepData = true;
    h.error = { response: { status: 404 } };
    renderPage();
    expect(screen.getByText("Talebe ulaşılamıyor.")).toBeInTheDocument();
  });

  it("veri yokken kesinti: 'Talep yüklenemedi' + Tekrar dene", () => {
    h.error = { message: "Network Error" };
    renderPage();
    expect(screen.getByText("Talep yüklenemedi.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tekrar dene" })).toBeInTheDocument();
  });

  it("çevrimdışı duraklayan sorguda (istek yok, hata yok, veri yok) 'bulunamadı' değil iskelet", () => {
    h.paused = true;
    const { container } = renderPage();
    expect(screen.queryByText(/bulunamadı/)).toBeNull();
    expect(container.querySelector(".animate-pulse")).not.toBeNull();
  });
});

describe("teklif veren talep detayı — mobil denetim (g08)", () => {
  it("meta şeridinde alıcı firma ve kapanış kırpılmaz (sarar); kutucuk kendi genişliğine göre dizilir", () => {
    h.detail = detail({ owner: { id: "c1", name: "QA Alıcı Sanayi A.Ş." } } as Partial<ListingDetail>);
    renderPage();
    const cls = (el: Element | null) => (el?.getAttribute("class") ?? "").split(/\s+/);
    const name = screen.getByText("QA Alıcı Sanayi A.Ş.", { selector: "[data-slot=\"meta-item\"] > dd" });
    expect(cls(name)).not.toContain("truncate");
    expect(cls(name)).not.toContain("sm:@[9.25rem]:truncate");
    // Dar düzende değer kutucuğun tam genişliğinde (iki sütunu kaplar).
    expect(cls(name)).toEqual(expect.arrayContaining(["col-span-2", "min-w-0", "break-words"]));
    // Kutucuk = `dl`nin çocuğu, hem kapsayıcı hem ızgara; çocukları yalnız dt / dd
    // (axe `definition-list`). Eşikler içerik kutusundan: kutucuk 10.75rem /
    // 12.5rem = içerik 9.25rem / 11rem (dolgu p-3 kutucuğun kendisinde).
    const item = name.closest('[data-slot="meta-item"]')!;
    expect(item.parentElement!.tagName).toBe("DL");
    expect(cls(item)).toEqual(expect.arrayContaining(["@container", "grid", "grid-cols-[auto_minmax(0,1fr)]", "p-3", "content-start"]));
    expect([...item.children].map((c) => c.tagName)).toEqual(["DT", "DT", "DD"]);
    // Simge: ayrı, ekran okuyucudan gizli dt; telefonda etiketin yanında kutusuz;
    // yan yana düzende kutu (iki satıra yayılır), geniş kutucukta eski 48 px.
    const icon = item.firstElementChild!;
    expect(icon).toHaveAttribute("aria-hidden", "true");
    expect(cls(icon)).toEqual(expect.arrayContaining(["size-4", "sm:@[9.25rem]:size-9", "sm:@[9.25rem]:row-span-2", "sm:@[11rem]:size-12"]));
    // Etiket dt'si ekran okuyucuya açık; değer yan yana düzende 2. satır / 2. sütunda.
    expect(item.children[1]).toHaveTextContent("Alıcı Firma");
    expect(item.children[1]).not.toHaveAttribute("aria-hidden");
    expect(cls(name)).toEqual(expect.arrayContaining(["sm:@[9.25rem]:col-start-2", "sm:@[9.25rem]:row-start-2"]));
    // Dört sütun yalnız şerit yeterince genişse (kutucuk ≥ 10.75rem).
    const dl = name.closest("dl")!;
    expect(cls(dl)).toContain("lg:@[43.5rem]:grid-cols-4");
    expect(cls(dl)).not.toContain("lg:grid-cols-4");
    expect(cls(dl.parentElement)).toContain("@container");
  });

  it("Kalemler tablosunda 'Benim birim fiyatım' başlığı her genişlikte sarar (tablo yana kaymaz)", () => {
    h.detail = detail({
      myBid: {
        amount: "485",
        status: "SUBMITTED",
        version: 1,
        note: null,
        currency: "TRY",
        items: [{ itemId: "i1", unitPrice: "48.5", currency: "TRY" }],
      },
    } as unknown as Partial<ListingDetail>);
    renderPage();
    const header = screen.getByRole("columnheader", { name: "Benim Birim Fiyatım" });
    expect(header.className.split(/\s+/)).toEqual(expect.arrayContaining(["text-right", "whitespace-normal"]));
  });

  // Mobil denetim fix3 r5-requests#new1: 768/1024'te nowrap kalem adı (407 px)
  // ve nowrap başlıklar tabloyu 792 px'e (RU 864) zorluyor, "Benim Birim
  // Fiyatım" sütunu tümüyle kartın dışında kalıyordu. Ad ve sayı başlıkları
  // her genişlikte sarar; ad sm'den itibaren 12rem tabanlı; kod nowrap.
  it("Kalemler tablosunda kalem adı ve sayı başlıkları tablette de sarar; malzeme kodu bölünmez", () => {
    h.detail = detail({
      items: [
        {
          id: "i1",
          lineNo: 1,
          name: "Kompakt şalter 3 kutuplu 250 A 36 kA termik manyetik",
          quantity: "40",
          unit: "Adet",
          unitCode: "C62",
          materialCode: "HAVB-X8EM",
          targetPrice: null,
        },
      ],
      myBid: {
        amount: "485",
        status: "SUBMITTED",
        version: 1,
        note: null,
        currency: "TRY",
        items: [{ itemId: "i1", unitPrice: "48.5", currency: "TRY" }],
      },
    } as unknown as Partial<ListingDetail>);
    renderPage();
    const table = screen.getByRole("columnheader", { name: "Benim Birim Fiyatım" }).closest("table")!;
    const nameCell = within(table).getByText("Kompakt şalter 3 kutuplu 250 A 36 kA termik manyetik").closest("td")!;
    const nameCls = nameCell.className.split(/\s+/);
    expect(nameCls).toEqual(expect.arrayContaining(["whitespace-normal", "sm:min-w-[12rem]"]));
    expect(nameCls.some((c) => /^(sm|md|lg):whitespace-nowrap$/.test(c))).toBe(false);
    for (const name of ["Miktar", "Hedef Fiyat"]) {
      const th = within(table).getByRole("columnheader", { name });
      expect(th.className.split(/\s+/)).toContain("whitespace-normal");
    }
    // Tireli kod bölünmez ve tabular rakamla çizilmez (Inter'in tabular tiresi
    // "HAVB - X8EM" boşluğu bırakıyordu; `lib/id-token.ts`).
    const code = within(table).getByText("HAVB-X8EM").className.split(/\s+/);
    expect(code).toEqual(expect.arrayContaining(["whitespace-nowrap", "normal-nums", "tracking-normal"]));
    expect(code).not.toContain("tabular-nums");
  });

  // Mobil denetim fix3 handoffs#new3: şerit akıştaydı ve başlık görünümden
  // çıkınca h-0 → 42 px büyüyordu; kaydırma sabitlemesi olmayan motorda
  // (iOS WebKit) içerik 42 px zıplıyordu. Akışta yalnız 0 yükseklikli
  // yapışkan çapa; şerit içinde absolute, yalnız görünürlüğü değişir.
  it("yapışkan eylem şeridi akış dışında: çapa h-0, şerit absolute, gizliyken yükseklik sınıfı değişmez", () => {
    renderPage();
    const anchor = document.querySelector("[data-sticky-action-bar]") as HTMLElement;
    expect(anchor).not.toBeNull();
    const anchorCls = anchor.className.split(/\s+/);
    expect(anchorCls).toEqual(expect.arrayContaining(["sticky", "top-(--topbar-h)", "h-0"]));
    // Çapa kendi biçimlendirme bağlamını kurar: `space-y` payı içinden geçip
    // komşununkiyle birleşmez, eski gizli şeridin boşluğu (sahip sayfasıyla
    // aynı) kalır; `overflow-hidden` değil — absolute şeridi kırpardı.
    expect(anchorCls).toContain("flow-root");
    expect(anchorCls).not.toContain("overflow-hidden");
    const bar = anchor.firstElementChild as HTMLElement;
    const barCls = bar.className.split(/\s+/);
    expect(barCls).toEqual(expect.arrayContaining(["absolute", "inset-x-0", "top-0"]));
    // Görünürlük yalnız `invisible` ile değişir; boyutu değiştiren sınıf yok.
    for (const c of ["h-0", "py-0", "border-0", "overflow-hidden"]) expect(barCls).not.toContain(c);
  });

  it("kapalı zarf bandında metin en az 12rem alır; 'Nasıl çalışır?' telefonda kendi satırına iner", () => {
    renderPage();
    const link = screen.getByRole("link", { name: "Nasıl çalışır?" });
    expect(link.className.split(/\s+/)).toEqual(expect.arrayContaining(["ml-auto", "whitespace-nowrap"]));
    const text = link.previousElementSibling!;
    expect(text.className.split(/\s+/)).toContain("flex-[1_1_12rem]");
    expect(text.className.split(/\s+/)).not.toContain("flex-1");
  });
});
