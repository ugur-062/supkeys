// @vitest-environment jsdom
/**
 * Ürünlerim listesi — satır içeriği + sekme sayaçları (2026-09-03).
 *
 * Kilit: satır durum rozetini (Taslak/Yayında), fiyat modunu ve kategoriyi
 * taşır; sekme sayaçları SUNUCUNUN firma-geneli `counts`undan gelir (arama
 * daraltınca değişmez); sekme yalnız istemcide süzer.
 */
import { onlineManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  get: vi.fn(),
  patch: vi.fn(),
  confirm: vi.fn(),
  push: vi.fn(),
  canManage: true,
  search: new URLSearchParams(),
  formProps: [] as Record<string, unknown>[],
}));

// Ürün ekleme düğmeleri "Ürün ve vitrin yönetimi" iznine kapılı (yetki tablosu).
vi.mock("@/hooks/use-company-auth", () => ({
  useHasCompanyPermission: () => h.canManage,
  useCompanyAuth: () => ({ user: { roles: ["SATISCI"], permissions: ["sell:product:manage"] }, company: null }),
}));
vi.mock("@/lib/company-auth/api", () => ({
  companyApi: { get: h.get, post: vi.fn(), patch: h.patch },
}));
vi.mock("@/lib/api", () => ({
  api: { get: h.get },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: h.push, replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => h.search,
  usePathname: () => "/company/satis/urunlerim",
}));
vi.mock("@/components/providers/confirm-dialog", () => ({ useConfirm: () => h.confirm }));
vi.mock("../product-showcase-form", () => ({
  // Kaydetmeyi taklit eden düğme: sayfanın `onSaved` ile gelen SUNUCU kaydını
  // ekrana işleyip işlemediği sınanır. "sahte-degistir" kirli bayrağı yukarı iletir.
  ProductShowcaseForm: (props: {
    product: { id: string };
    onSaved?: (saved: unknown) => void;
    onDirtyChange?: (dirty: boolean) => void;
  }) => {
    h.formProps.push(props as unknown as Record<string, unknown>);
    return (
      <div data-testid="form">
        <button
          type="button"
          onClick={() => props.onSaved?.({ ...props.product, reviewStatus: "PENDING", isPublic: true })}
        >
          sahte-kaydet
        </button>
        <button type="button" onClick={() => props.onDirtyChange?.(true)}>
          sahte-degistir
        </button>
      </div>
    );
  },
}));
vi.mock("../product-preview", () => ({
  ProductPreview: (props: { variant?: string; onEdit?: () => void }) => (
    <div data-testid="preview" data-variant={props.variant ?? "review"}>
      {props.onEdit ? (
        <button type="button" onClick={props.onEdit}>
          Düzenle
        </button>
      ) : null}
    </div>
  ),
}));

import { ProductsView } from "../products-view";

const ITEMS = [
  {
    id: "p1",
    code: null,
    name: "Dağıtım panosu",
    unit: "adet",
    categoryId: "39121600",
    brand: null,
    isActive: true,
    isPublic: true,
    publishedAt: "2026-09-01T00:00:00.000Z",
    reviewStatus: "APPROVED",
    rejectReason: null,
    thumbnailUrl: null,
    priceMode: "TIERED",
    updatedAt: "2026-09-02T10:00:00.000Z",
  },
  {
    id: "p2",
    code: "K-2",
    name: "Kablo kanalı",
    unit: "m",
    categoryId: null,
    brand: null,
    isActive: true,
    isPublic: false,
    publishedAt: null,
    reviewStatus: "DRAFT",
    rejectReason: null,
    thumbnailUrl: null,
    priceMode: "ON_REQUEST",
    updatedAt: "2026-09-03T10:00:00.000Z",
  },
  {
    id: "p3",
    code: null,
    name: "Sigorta kutusu",
    unit: "adet",
    categoryId: null,
    brand: null,
    isActive: true,
    isPublic: false,
    publishedAt: null,
    reviewStatus: "PENDING",
    rejectReason: null,
    thumbnailUrl: null,
    priceMode: "FIXED",
    updatedAt: "2026-09-04T10:00:00.000Z",
  },
  {
    id: "p4",
    code: null,
    name: "Priz grubu",
    unit: "adet",
    categoryId: null,
    brand: null,
    isActive: true,
    isPublic: false,
    publishedAt: null,
    reviewStatus: "REJECTED",
    rejectReason: "Görseller ürüne ait değil",
    thumbnailUrl: null,
    priceMode: "FIXED",
    updatedAt: "2026-09-05T10:00:00.000Z",
  },
];

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

/** API `SHOWCASE_STATUS_WHERE` aynası — web `productStatusKey` ile birebir. */
function statusMatches(i: { isPublic: boolean; reviewStatus: string }, status?: string): boolean {
  if (!status) return true;
  if (status === "published") return i.isPublic;
  if (status === "pending") return !i.isPublic && i.reviewStatus === "PENDING";
  if (status === "rejected") return i.reviewStatus === "REJECTED";
  return !i.isPublic && i.reviewStatus !== "PENDING" && i.reviewStatus !== "REJECTED";
}

beforeEach(() => {
  h.get.mockReset();
  h.patch.mockReset();
  h.confirm.mockReset();
  h.confirm.mockResolvedValue(true);
  h.push.mockReset();
  h.canManage = true;
  h.search = new URLSearchParams();
  h.formProps = [];
  h.get.mockImplementation((url: string, config?: { params?: Record<string, unknown> }) => {
    // Vitrin okuma (`GET :id/showcase`) — düzenleyici/önizleme açılışı.
    const m = url.match(/\/company\/items\/(p\d)\/showcase$/);
    if (m) {
      const item = ITEMS.find((i) => i.id === m[1])!;
      return Promise.resolve({
        data: {
          id: item.id, name: item.name, slug: null, isPublic: item.isPublic, publishedAt: item.publishedAt,
          reviewStatus: item.reviewStatus, submittedAt: null, reviewedAt: null, rejectReason: item.rejectReason,
          categoryId: item.categoryId, description: null, images: [], videoUrl: null, externalUrl: null, documents: null,
          keywords: [], attributes: null, priceMode: item.priceMode, priceAmount: null, priceTiers: null, priceCurrency: "TRY",
          moq: null, unit: item.unit, unitCode: "PCE", completion: { score: 0, missing: [] }, publishBlockers: [], attributeDefs: [],
        },
      });
    }
    if (url.includes("/categories/by-ids")) {
      return Promise.resolve({
        data: [{ id: "39121600", code: "39121600", nameTr: "Dağıtım panoları", level: 3, breadcrumb: "" }],
      });
    }
    // Sunucu süzgecinin aynası (API `SHOWCASE_STATUS_WHERE`): sekme SUNUCUDA süzülür.
    const items = ITEMS.filter((i) => statusMatches(i, config?.params?.status as string | undefined));
    return Promise.resolve({
      data: { items, total: items.length, truncated: false, counts: { published: 1, draft: 1, pending: 1, rejected: 1, publishedInReview: 0 } },
    });
  });
});

afterEach(() => {
  // Çevrimdışı testi ağı kapatır; sonraki testler çevrimiçi başlasın.
  onlineManager.setOnline(true);
});

describe("ProductsView", () => {
  it("satır: durum rozeti, fiyat modu, kategori adı", async () => {
    wrap(<ProductsView />);
    expect(await screen.findByText("Dağıtım panosu")).toBeInTheDocument();
    // Rozetler LİSTEDE (sekme adlarıyla aynı sözcük — kapsamı daralt).
    const list = screen.getByRole("list");
    // Durum rozeti satırda İKİ kez basılır (sm+ sütunda, dar ekranda ad altında).
    expect(within(list).getAllByText("Yayında").length).toBeGreaterThan(0);
    expect(within(list).getAllByText("Taslak").length).toBeGreaterThan(0);
    expect(await screen.findByText(/Dağıtım panoları · Kademeli · adet/)).toBeInTheDocument();
    expect(screen.getByText(/Kategori seçilmedi · Teklif isteyin · m/)).toBeInTheDocument();
  });

  it("sekmeler sunucu sayaçlarını taşır ve listeyi süzer", async () => {
    const user = userEvent.setup();
    wrap(<ProductsView />);
    await screen.findByText("Dağıtım panosu");
    const tabs = screen.getByRole("tablist");
    expect(within(tabs).getByRole("tab", { name: /Tümü\s*4/ })).toBeInTheDocument();
    expect(within(tabs).getByRole("tab", { name: /Yayında\s*1/ })).toBeInTheDocument();
    expect(within(tabs).getByRole("tab", { name: /Onay bekliyor\s*1/ })).toBeInTheDocument();
    expect(within(tabs).getByRole("tab", { name: /Düzeltme istendi\s*1/ })).toBeInTheDocument();

    await user.click(within(tabs).getByRole("tab", { name: /Taslak\s*1/ }));
    expect(screen.queryByText("Dağıtım panosu")).toBeNull();
    expect(screen.getByText("Kablo kanalı")).toBeInTheDocument();
  });

  it("moderasyon: onay bekleyen ve düzeltme istenen rozetleri; düzeltme gerekçesi satırda", async () => {
    const user = userEvent.setup();
    wrap(<ProductsView />);
    await screen.findByText("Sigorta kutusu");
    const list = screen.getByRole("list");
    expect(within(list).getAllByText("Onay bekliyor").length).toBeGreaterThan(0);
    expect(within(list).getAllByText("Düzeltme istendi").length).toBeGreaterThan(0);
    expect(within(list).getByText(/Düzeltme: Görseller ürüne ait değil/)).toBeInTheDocument();
    const tabs = screen.getByRole("tablist");
    await user.click(within(tabs).getByRole("tab", { name: /Düzeltme istendi/ }));
    expect(screen.getByText("Priz grubu")).toBeInTheDocument();
    expect(screen.queryByText("Sigorta kutusu")).toBeNull();
  });

  it("İNCELEME KİLİDİ: onay bekleyen ürün FORMLA değil ÖNİZLEMEYLE açılır; açılış GET ile (boş PATCH yok)", async () => {
    const user = userEvent.setup();
    wrap(<ProductsView />);
    await user.click(await screen.findByText("Sigorta kutusu")); // PENDING
    expect(await screen.findByTestId("preview")).toBeInTheDocument();
    expect(screen.queryByTestId("form")).toBeNull();
    expect(screen.getByText("Ürün incelemede — ekibimiz karar verene kadar yalnız önizlenir.")).toBeInTheDocument();
    expect(h.get.mock.calls.some(([u]) => u === "/company/items/p3/showcase")).toBe(true);
    expect(h.patch).not.toHaveBeenCalled(); // eski boş PATCH görsel/etiket/fiyatı siliyordu

    await user.click(screen.getByRole("button", { name: /Ürünlere dön/ }));
    await user.click(await screen.findByText("Dağıtım panosu")); // APPROVED + yayında → ÖNCE önizleme
    expect(await screen.findByTestId("preview")).toHaveAttribute("data-variant", "published");
    expect(screen.queryByTestId("form")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Düzenle" }));
    expect(await screen.findByTestId("form")).toBeInTheDocument();
    expect(screen.queryByTestId("preview")).toBeNull();
  });

  // Mobil denetim g09: telefonda yalnız Ürün sütunu görünür; ad ve alt satır
  // 176 px'te tek satıra kırpılınca benzer ürünler ayırt edilemiyordu, düzeltme
  // gerekçesi kırpılan alt satırın SONUNA eklendiği için hiç okunmuyordu.
  it("telefon satırı: ad ve alt satır iki satıra kadar sarar (sm'den tek satır), düzeltme gerekçesi KENDİ satırında", async () => {
    wrap(<ProductsView />);
    const nameSpan = await screen.findByText("Priz grubu");
    expect(nameSpan.className).toMatch(/max-sm:line-clamp-2/);
    const nameButton = nameSpan.closest("button")!;
    expect(nameButton).toHaveAttribute("title", "Priz grubu");
    expect(nameButton.className).toMatch(/sm:truncate/);
    expect(nameButton.className).not.toMatch(/max-w-\[11rem\]/);

    const reason = screen.getByText("Düzeltme: Görseller ürüne ait değil");
    expect(reason.className).toMatch(/line-clamp-2/);
    // Alt satır (kategori · fiyat modu · birim) gerekçeyi TAŞIMAZ.
    const subline = reason.previousElementSibling!;
    expect(subline).toHaveTextContent(/Kategori seçilmedi ·/);
    expect(subline.textContent).not.toMatch(/Düzeltme/);
    expect(subline.className).toMatch(/max-sm:line-clamp-2/);
  });

  it("tablo yatay kaydırmaz: kapsayıcıda overflow-x-auto / min-w yok, dar sütunlar kesme noktasıyla gizli", async () => {
    wrap(<ProductsView />);
    await screen.findByText("Dağıtım panosu");
    const table = screen.getByRole("table");
    expect(table.className).not.toMatch(/min-w-/);
    expect(table.parentElement?.className).not.toMatch(/overflow-x-auto/);
    const heads = screen.getAllByRole("columnheader").map((h) => [h.textContent, h.className] as const);
    expect(heads.find(([t]) => t === "Ürün")?.[1]).not.toMatch(/hidden/);
  });

  // Mobil denetim 2026-10, beşinci tur: 1280'de sabit kenar çubuğuyla kart 944 px,
  // 1536'da 1200 px; ekran kırılımıyla açılan geniş sütunlar RU'da (gerçek veriyle
  // 6 / 29 px, "Опубликован · на проверке" rozetiyle 93 px) tabloyu kartın dışına
  // itiyor, Действия sütunu kesiliyor, ⋮ AI düğmesinin sütununa düşüyordu. Geniş
  // sütunlar artık KARTIN kendi genişliğine göre açılır; th ve td aynı eşiği taşır.
  it("geniş sütunlar tablo kartının genişliğine göre (@container) açılır, ekran kırılımına göre değil", async () => {
    wrap(<ProductsView />);
    await screen.findByText("Dağıtım panosu");
    const table = screen.getByRole("table");
    expect(table.parentElement!.className.split(/\s+/)).toContain("@container");
    const heads = screen.getAllByRole("columnheader");
    const row = screen.getByRole("button", { name: "Dağıtım panosu — işlemler" }).closest("tr")!;
    const cells = [...row.children] as HTMLElement[];
    const tiers: [string, string][] = [
      ["Min. sipariş", "@[58rem]:table-cell"],
      ["Görüntülenme", "@[64rem]:table-cell"],
      ["Eklenme", "@[72rem]:table-cell"],
      ["Kategori", "@[77rem]:table-cell"],
    ];
    for (const [label, tier] of tiers) {
      const head = heads.find((h) => h.textContent === label)!;
      const cell = cells[heads.indexOf(head)]!;
      for (const el of [head, cell]) {
        const cls = el.className.split(/\s+/);
        expect(cls).toEqual(expect.arrayContaining(["hidden", tier]));
        expect(cls.some((c) => /^(?:sm|md|lg|xl|2xl):table-cell$/.test(c))).toBe(false);
      }
    }
  });

  // Mobil denetim 2026-10 (640-767 px): Ürün + Durum + Fiyat + ⋮ (AI düğmesi
  // payıyla) içeriğe sığmıyordu — tablo TR 626 / RU 687 px, alan 592 px; ⋮
  // kesiliyor ve AI düğmesinin sütununa düşüyordu. Fiyat md'den; durum ve
  // fiyat her genişlikte sözcük (fiyatta parça) arasında sarabilir.
  it("640-767 px: Fiyat sütunu md'den görünür; durum rozeti ve fiyat sözcük arasında sarabilir (tablo içeriğe sığar)", async () => {
    wrap(<ProductsView />);
    await screen.findByText("Dağıtım panosu");
    const heads = screen.getAllByRole("columnheader");
    const priceHead = heads.find((h) => h.textContent === "Fiyat")!;
    const priceHeadCls = priceHead.className.split(/\s+/);
    expect(priceHeadCls).toEqual(expect.arrayContaining(["hidden", "md:table-cell"]));
    expect(priceHeadCls).not.toContain("sm:table-cell");
    const statusHead = heads.find((h) => h.textContent === "Durum")!;
    expect(statusHead.className.split(/\s+/)).toEqual(expect.arrayContaining(["hidden", "sm:table-cell"]));

    const row = screen.getByRole("button", { name: "Dağıtım panosu — işlemler" }).closest("tr")!;
    const cells = [...row.children] as HTMLElement[];
    const priceIdx = heads.indexOf(priceHead);
    const statusIdx = heads.indexOf(statusHead);
    const priceCell = cells[priceIdx]!.className.split(/\s+/);
    expect(priceCell).toEqual(expect.arrayContaining(["hidden", "md:table-cell"]));
    expect(priceCell).not.toContain("sm:table-cell");
    // Beşinci tur: fiyat ve durum hiçbir genişlikte tek satıra ZORLANMAZ (xl'deki
    // `whitespace-nowrap` 1280'de Действия sütununu kartın dışına itiyordu).
    expect(priceCell.some((c) => /whitespace-nowrap$/.test(c))).toBe(false);
    const statusCell = cells[statusIdx]!.className.split(/\s+/);
    expect(statusCell).toEqual(expect.arrayContaining(["hidden", "sm:table-cell"]));
    expect(statusCell.some((c) => /whitespace-nowrap$/.test(c))).toBe(false);
  });

  it("fiyat yalnız parçalar arasında sarar: tutar ve birim bölünmez, eğik çizgi birime bağlı", async () => {
    const tiered = {
      ...ITEMS[0]!,
      id: "p9",
      name: "Uzun fiyatlı pano",
      priceAmount: "1250000",
      priceCurrency: "TRY",
      unit: "metre kare",
    };
    const base = h.get.getMockImplementation()!;
    h.get.mockImplementation((url: string, config?: { params?: Record<string, unknown> }) =>
      url.includes("/categories/by-ids") || /\/showcase$/.test(url)
        ? base(url, config)
        : Promise.resolve({
            data: { items: [tiered], total: 1, truncated: false, counts: { published: 1, draft: 0, pending: 0, rejected: 0, publishedInReview: 0 } },
          }),
    );
    wrap(<ProductsView />);
    await screen.findByText("Uzun fiyatlı pano");
    const heads = screen.getAllByRole("columnheader");
    const row = screen.getByRole("button", { name: "Uzun fiyatlı pano — işlemler" }).closest("tr")!;
    const text = (row.children[heads.findIndex((h) => h.textContent === "Fiyat")] as HTMLElement).textContent!;
    // Düz boşluk yalnız tutar ile "/" arasında ve kademeli ekinden önce kalır.
    expect(text.split(" ")).toEqual([
      "1.250.000\u00a0₺",
      "/\u00a0metrekare",
      "(kademeli)",
    ]);
  });

  it("⋮ sütunu sm'den itibaren AI Asistan düğmesinin solunda (sağ pay); telefonda ⋮ durum satırında, düğmenin sütununun solunda (mobil denetim 2026-10)", async () => {
    wrap(<ProductsView />);
    const kebab = await screen.findByRole("button", { name: "Dağıtım panosu — işlemler" });
    const cell = kebab.closest("td")!;
    const classes = (cell.getAttribute("class") ?? "").split(/\s+/);
    expect(classes).toEqual(expect.arrayContaining(["px-3", "py-3", "text-right", "sm:pr-18", "lg:pr-16", "xl:pr-14"]));
    // Kırılımsız ek sağ pay yok (sm+ yerleşimi aynı).
    expect(classes.filter((c) => /^(?:pr|pe)-/.test(c))).toEqual([]);
    // TELEFON (dördüncü tur): sütun sıfır genişlikte ve `relative`; ⋮ ondan
    // sağdan 48 px içeride, durum rozetinin satırında (tek düğüm).
    expect(classes).toEqual(expect.arrayContaining(["max-sm:relative", "max-sm:w-0", "max-sm:px-0", "max-sm:py-0"]));
    const anchor = (cell.querySelector("span") ?? cell).getAttribute("class")?.split(/\s+/) ?? [];
    expect(anchor).toEqual(expect.arrayContaining(["max-sm:absolute", "max-sm:right-12", "max-sm:bottom-0.5"]));
    expect(cell.querySelectorAll("button")).toHaveLength(1);
    // Ad düğmesi düğmenin sütununa girmez; rozet satırı ⋮'nin yerini bırakır.
    const row = cell.closest("tr")!;
    const name = within(row).getByRole("button", { name: "Dağıtım panosu" });
    expect(name.className).toMatch(/(?:^|\s)max-sm:mr-9(?:\s|$)/);
    const badgeLine = [...row.querySelectorAll("td:first-child div")].find((d) => /(?:^|\s)sm:hidden(?:\s|$)/.test(d.className))!;
    expect(badgeLine.className).toMatch(/(?:^|\s)max-sm:pr-22(?:\s|$)/);
  });

  it("yayındaki ürün kaydedilince sunucu incelemeye aldıysa ekran HEMEN önizlemeye geçer (yenileme gerekmez)", async () => {
    const user = userEvent.setup();
    wrap(<ProductsView />);
    await user.click(await screen.findByText("Dağıtım panosu")); // APPROVED → önizleme → Düzenle → form
    await user.click(await screen.findByRole("button", { name: "Düzenle" }));
    expect(await screen.findByTestId("form")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "sahte-kaydet" }));
    expect(await screen.findByTestId("preview")).toHaveAttribute("data-variant", "review");
    expect(screen.queryByTestId("form")).toBeNull();
    expect(screen.getByText("Ürün incelemede — ekibimiz karar verene kadar yalnız önizlenir.")).toBeInTheDocument();
  });

  it("durum kutuları MECE: yayındayken yeniden incelenen ürün YALNIZ Yayında'da sayılır ve listelenir; boş kutu 0 gösterir", async () => {
    const user = userEvent.setup();
    h.get.mockImplementation((url: string, config?: { params?: Record<string, unknown> }) => {
      if (url.includes("/categories/by-ids")) return Promise.resolve({ data: [] });
      // 1 ürün: yayında + yeniden incelemede → sunucu published 1, pending 1,
      // publishedInReview 1 sayar; "Onay bekliyor" sekmesi sunucuda boş döner.
      const item = { ...ITEMS[0], reviewStatus: "PENDING" };
      const items = statusMatches(item, config?.params?.status as string | undefined) ? [item] : [];
      return Promise.resolve({
        data: { items, total: items.length, truncated: false, counts: { published: 1, draft: 0, pending: 1, rejected: 0, publishedInReview: 1 } },
      });
    });
    wrap(<ProductsView />);
    await screen.findByText("Dağıtım panosu");
    const tabs = screen.getByRole("tablist");
    expect(within(tabs).getByRole("tab", { name: /Tümü\s*1$/ })).toBeInTheDocument();
    expect(within(tabs).getByRole("tab", { name: /Yayında\s*1$/ })).toBeInTheDocument();
    expect(within(tabs).getByRole("tab", { name: /Onay bekliyor\s*0$/ })).toBeInTheDocument();
    expect(within(tabs).getByRole("tab", { name: /Taslak\s*0$/ })).toBeInTheDocument();
    expect(within(screen.getByRole("list")).getAllByText("Yayında · incelemede").length).toBeGreaterThan(0);
    await user.click(within(tabs).getByRole("tab", { name: /Onay bekliyor\s*0$/ }));
    expect(screen.queryByText("Dağıtım panosu")).toBeNull();
    expect(screen.getByText("Onay bekleyen ürün yok.")).toBeInTheDocument();
  });

  it("liste SUNUCUDAN en yeni üstte ve sekme parametresiyle istenir; devamı 'Daha fazla yükle' ile (yayın denetimi 2026-09-28)", async () => {
    const user = userEvent.setup();
    h.get.mockImplementation((url: string, config?: { params?: Record<string, unknown> }) => {
      if (url.includes("/categories/by-ids")) return Promise.resolve({ data: [] });
      const page = config?.params?.skip ? [ITEMS[1]] : [ITEMS[0]];
      return Promise.resolve({
        data: { items: page, total: 2, truncated: !config?.params?.skip, counts: { published: 1, draft: 1, pending: 0, rejected: 0 } },
      });
    });
    wrap(<ProductsView />);
    expect(await screen.findByText("Dağıtım panosu")).toBeTruthy();
    const listCalls = () => h.get.mock.calls.filter(([u]) => u === "/company/items");
    expect(listCalls()[0]![1]).toMatchObject({ params: { sort: "recent", take: 50, skip: 0 } });
    await user.click(screen.getByRole("button", { name: "Daha fazla yükle" }));
    expect(await screen.findByText("Kablo kanalı")).toBeTruthy();
    expect(screen.getByText("Dağıtım panosu")).toBeTruthy();
    expect(listCalls().at(-1)![1]).toMatchObject({ params: { skip: 1 } });
    expect(screen.queryByRole("button", { name: "Daha fazla yükle" })).toBeNull();
    // Sekme değişince sunucuya `status` gider.
    await user.click(within(screen.getByRole("tablist")).getByRole("tab", { name: /Yayında/ }));
    expect(listCalls().some(([, c]) => (c as { params?: { status?: string } })?.params?.status === "published")).toBe(true);
  });

  it("başlıkta TEK eylem 'Yeni ürün'; toplu ekleme KALDIRILDI (2026-09-15)", async () => {
    wrap(<ProductsView />);
    await screen.findByText("Dağıtım panosu");
    expect(screen.getByRole("button", { name: "Yeni ürün" }).className).toContain("bg-emerald-600");
    // Excel şablonu görselsiz ürün üretiyordu, katalog çıkarımı çalışmıyordu.
    expect(screen.queryByRole("button", { name: /Toplu ekle/ })).toBeNull();
  });
  it("doğrulanmamış firma: sekme düz sayı gösterir (D-196), tavan notundaki bağlantı doğrulama akışına gider (O-040; ücretsiz dönem)", async () => {
    h.get.mockImplementation((url: string) => {
      if (url.includes("/categories/by-ids")) return Promise.resolve({ data: [] });
      return Promise.resolve({
        data: { items: [ITEMS[2]], total: 1, truncated: false, productLimit: 50, counts: { published: 0, draft: 0, pending: 50, rejected: 0, publishedInReview: 0 } },
      });
    });
    wrap(<ProductsView />);
    await screen.findByText("Sigorta kutusu");
    const tabs = screen.getByRole("tablist");
    expect(within(tabs).getByRole("tab", { name: /Yayında\s*0$/ })).toBeInTheDocument();
    expect(screen.queryByText("0/50")).toBeNull();
    expect(screen.getByText(/50\/50 kullanıldı/)).toBeInTheDocument();
    const note = screen.getByText(/50\/50 kullanıldı/);
    expect(note).toHaveTextContent(/Doğrulanmamış firmada en fazla 50 ürün/);
    expect(note).not.toHaveTextContent(/Silver|Gold|paket/i);
    const link = screen.getByRole("link", { name: /Firma doğrulamasıyla sınırsız ürün/ });
    expect(link).toHaveAttribute("href", "/company/ayarlar/dogrulama");
  });

  it("salt-okur kullanıcıya ?yeni=1 form AÇMAZ, liste görünür (O-099)", async () => {
    h.canManage = false;
    h.search = new URLSearchParams("yeni=1");
    wrap(<ProductsView />);
    expect(await screen.findByText("Dağıtım panosu")).toBeInTheDocument();
    expect(screen.queryByTestId("form")).toBeNull();
    expect(screen.queryByRole("button", { name: "Yeni ürün" })).toBeNull();
  });

  it("?yeni=1: tavan bilgisi gelene kadar form limitPending alır (D-287)", async () => {
    h.search = new URLSearchParams("yeni=1");
    let resolveList: (v: unknown) => void = () => {};
    h.get.mockImplementation((url: string) => {
      if (url !== "/company/items") return Promise.resolve({ data: [] });
      return new Promise((r) => {
        resolveList = r;
      });
    });
    wrap(<ProductsView />);
    expect(await screen.findByTestId("form")).toBeInTheDocument();
    expect(h.formProps.at(-1)).toMatchObject({ limitPending: true });
    resolveList({ data: { items: [], total: 0, truncated: false, productLimit: 50, counts: { published: 0, draft: 0, pending: 0, rejected: 0 } } });
    await vi.waitFor(() => expect(h.formProps.at(-1)).toMatchObject({ limitPending: false, publishLimitReached: false }));
  });

  it("kaydedilmemiş değişiklik: 'Ürünlere dön' onay sorar; vazgeçilirse formda kalınır, kenar çubuğu bağlantısı da korunur (O-098)", async () => {
    const user = userEvent.setup();
    h.search = new URLSearchParams("yeni=1");
    wrap(
      <>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- kenar çubuğu bağlantısını taklit eden düz çapa; next/link router bağlamı ister */}
        <a href="/company/anasayfa">Anasayfa</a>
        <ProductsView />
      </>,
    );
    await screen.findByTestId("form");
    // Kirli değilken onay sorulmaz.
    await user.click(screen.getByRole("button", { name: /Ürünlere dön/ }));
    expect(h.confirm).not.toHaveBeenCalled();
    await user.click(await screen.findByRole("button", { name: "Yeni ürün" }));
    await user.click(screen.getByRole("button", { name: "sahte-degistir" }));

    h.confirm.mockResolvedValueOnce(false);
    await user.click(screen.getByRole("button", { name: /Ürünlere dön/ }));
    expect(h.confirm).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("form")).toBeInTheDocument();

    h.confirm.mockResolvedValueOnce(false);
    await user.click(screen.getByRole("link", { name: "Anasayfa" }));
    expect(h.confirm).toHaveBeenCalledTimes(2);
    expect(h.push).not.toHaveBeenCalled();
    h.confirm.mockResolvedValueOnce(true);
    await user.click(screen.getByRole("link", { name: "Anasayfa" }));
    await vi.waitFor(() => expect(h.push).toHaveBeenCalledWith("/company/anasayfa"));

    h.confirm.mockResolvedValueOnce(true);
    await user.click(screen.getByRole("button", { name: /Ürünlere dön/ }));
    expect(await screen.findByText("Dağıtım panosu")).toBeInTheDocument();
    expect(screen.queryByTestId("form")).toBeNull();
  });

  it("satır ⋮ menüsü: Aç / Arşivle (incelemedekinde yok); Arşiv sekmesinde Geri al (O-039)", async () => {
    const user = userEvent.setup();
    h.patch.mockResolvedValue({ data: {} });
    wrap(<ProductsView />);
    await screen.findByText("Kablo kanalı");
    // İncelemedeki ürünün menüsünde Arşivle yok.
    await user.click(screen.getByRole("button", { name: "Sigorta kutusu — işlemler" }));
    expect(await screen.findByRole("menuitem", { name: "Aç" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Arşivle" })).toBeNull();
    await user.keyboard("{Escape}");

    await user.click(screen.getByRole("button", { name: "Kablo kanalı — işlemler" }));
    await user.click(await screen.findByRole("menuitem", { name: "Arşivle" }));
    await vi.waitFor(() => expect(h.patch).toHaveBeenCalledWith("/company/items/p2/active", { isActive: false }));
    expect(h.confirm).toHaveBeenCalledWith(expect.objectContaining({ title: "Ürün arşivlensin mi?" }));
    // Menü satırı açmadı.
    expect(screen.queryByTestId("form")).toBeNull();

    await user.click(within(screen.getByRole("tablist")).getByRole("tab", { name: /Arşiv/ }));
    const listCalls = () => h.get.mock.calls.filter(([u]) => u === "/company/items");
    await vi.waitFor(() =>
      expect(listCalls().some(([, c]) => (c as { params?: { archived?: number } })?.params?.archived === 1)).toBe(true),
    );
    await user.click(await screen.findByRole("button", { name: "Dağıtım panosu — işlemler" }));
    await user.click(await screen.findByRole("menuitem", { name: "Geri al" }));
    await vi.waitFor(() => expect(h.patch).toHaveBeenCalledWith("/company/items/p1/active", { isActive: true }));
  });

  it("açık ürün adreste (?urun=<id>): açılış yazar, 'Ürünlere dön' geri alır (arayüz testi D-131)", async () => {
    window.history.replaceState(null, "", "/company/satis/urunlerim");
    const user = userEvent.setup();
    wrap(<ProductsView />);
    await user.click(await screen.findByText("Sigorta kutusu"));
    expect(await screen.findByTestId("preview")).toBeInTheDocument();
    expect(new URLSearchParams(window.location.search).get("urun")).toBe("p3");

    await user.click(screen.getByRole("button", { name: /Ürünlere dön/ }));
    await vi.waitFor(() => expect(new URLSearchParams(window.location.search).get("urun")).toBeNull());
  });

  it("derin bağlantı ?urun=<id> ürünü doğrudan açar (bilgi talebinden gelen bağlantı)", async () => {
    window.history.replaceState(null, "", "/company/satis/urunlerim?urun=p2");
    h.search = new URLSearchParams("urun=p2");
    wrap(<ProductsView />);
    expect(await screen.findByTestId("form")).toBeInTheDocument();
    expect(h.get.mock.calls.some(([u]) => u === "/company/items/p2/showcase")).toBe(true);
    expect((h.formProps.at(-1)!.product as { id: string }).id).toBe("p2");
  });

  it("sekme adrese yazılır (?sekme=)", async () => {
    window.history.replaceState(null, "", "/company/satis/urunlerim");
    const user = userEvent.setup();
    wrap(<ProductsView />);
    await screen.findByText("Dağıtım panosu");
    await user.click(within(screen.getByRole("tablist")).getByRole("tab", { name: /Taslak/ }));
    expect(new URLSearchParams(window.location.search).get("sekme")).toBe("draft");
    await user.click(within(screen.getByRole("tablist")).getByRole("tab", { name: /Tümü/ }));
    expect(new URLSearchParams(window.location.search).get("sekme")).toBeNull();
  });

  it("arama gecikmeli: hızlı yazımda tek istek (arayüz testi D-286)", async () => {
    const user = userEvent.setup();
    wrap(<ProductsView />);
    await screen.findByText("Dağıtım panosu");
    await user.type(screen.getByPlaceholderText(/Ürünlerde ara/i), "Çelik");
    const withQ = () =>
      h.get.mock.calls.filter(([u, c]) => u === "/company/items" && (c as { params?: { q?: string } })?.params?.q);
    await vi.waitFor(() => expect(withQ().length).toBeGreaterThan(0));
    expect(withQ()).toHaveLength(1);
    expect((withQ()[0]![1] as { params: { q: string } }).params.q).toBe("Çelik");
  });

  /**
   * Canlı doğrulama OUT-2 (API kesintisi): 93 ürünü olan firmaya "Henüz ürün
   * yok." + "Yeni ürün ekle" çiziliyordu, hata kartı yoktu. Boş durum yalnız
   * BAŞARILI ve boş yanıtta; okunamayan liste hata kartı alır, sekme sayaçları
   * "0" değil "—" kalır.
   */
  it("liste okunamadı (kesinti): 'Henüz ürün yok' DEĞİL hata kartı; sayaç 0 basılmaz; Tekrar dene listeyi getirir", async () => {
    const user = userEvent.setup();
    const healthy = h.get.getMockImplementation()!;
    h.get.mockImplementation((url: string) =>
      url === "/company/items" ? Promise.reject(Object.assign(new Error("Network Error"), { code: "ERR_NETWORK" })) : healthy(url),
    );
    wrap(<ProductsView />);
    const card = await screen.findByRole("alert");
    expect(card).toHaveTextContent("Bir şeyler ters gitti");
    expect(screen.queryByText("Henüz ürün yok.")).toBeNull();
    expect(screen.queryByRole("button", { name: "Yeni ürün ekle" })).toBeNull();
    const tabs = within(screen.getByRole("tablist"));
    expect(tabs.getByRole("tab", { name: /Tümü/ })).toHaveTextContent("Tümü—");
    expect(tabs.getByRole("tab", { name: /Yayında/ })).toHaveTextContent("Yayında—");

    h.get.mockImplementation(healthy);
    await user.click(screen.getByRole("button", { name: "Tekrar dene" }));
    expect(await screen.findByText("Dağıtım panosu")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  /**
   * Gözden geçirme REV-2: cihaz çevrimdışıyken TanStack sorguyu DURAKLATIR —
   * istek gitmez, hata da olmaz (`isLoading` false, `isError` false, veri yok).
   * "Yükleniyor" `isLoading`e bağlıyken liste boş durum dalına düşüyor, yanıt
   * hiç gelmediği hâlde "Henüz ürün yok." + "Yeni ürün ekle" çiziliyordu.
   */
  it("cihaz çevrimdışı (sorgu duraklatıldı): 'Henüz ürün yok' DEĞİL 'Yükleniyor'; sayaç 0 basılmaz; bağlantı dönünce liste gelir", async () => {
    onlineManager.setOnline(false);
    wrap(<ProductsView />);
    expect(screen.getByText("Yükleniyor…")).toBeInTheDocument();
    expect(screen.queryByText("Henüz ürün yok.")).toBeNull();
    expect(screen.queryByRole("button", { name: "Yeni ürün ekle" })).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    const tabs = within(screen.getByRole("tablist"));
    expect(tabs.getByRole("tab", { name: /Tümü/ })).toHaveTextContent("Tümü—");
    // Duraklatılan sorgu istek ATMAZ: ne hata ne yanıt var.
    expect(h.get.mock.calls.filter(([url]) => url === "/company/items")).toHaveLength(0);

    act(() => onlineManager.setOnline(true));
    expect(await screen.findByText("Dağıtım panosu")).toBeInTheDocument();
    expect(screen.queryByText("Yükleniyor…")).toBeNull();
  });

  it("BAŞARILI ve boş yanıt: boş durum + 'Yeni ürün ekle' (hata kartı değil)", async () => {
    h.get.mockImplementation(() =>
      Promise.resolve({
        data: { items: [], total: 0, truncated: false, counts: { published: 0, draft: 0, pending: 0, rejected: 0, publishedInReview: 0 } },
      }),
    );
    wrap(<ProductsView />);
    expect(await screen.findByText("Henüz ürün yok.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Yeni ürün ekle" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
