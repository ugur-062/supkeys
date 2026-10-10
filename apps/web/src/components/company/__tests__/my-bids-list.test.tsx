// @vitest-environment jsdom
import { onlineManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MyBid, MyBidsPage, MyBidsQuery } from "@/hooks/use-company-listings";

/**
 * Tekliflerim (arayüz testi webC-02):
 *  · O-005 — süzme/sıralama/sayfa SUNUCUYA gider, sayaçlar `counts`tan
 *    (eskiden en yeni 200 teklifte istemcide sayılıyordu).
 *  · O-036 — "Revizyon N" gönderim sayısından (`submitCount`), `version` değil.
 *  · D-120 — süzgeç/sıralama/sayfa URL'de; KPI `?pending=1` / `?status=WON`.
 *  · D-148 — "Alıcı: <ad>" (etiket ile ad arasında boşluk).
 */
const h = vi.hoisted(() => ({
  search: "",
  calls: [] as unknown[],
  page: null as unknown,
  /** Sorgu okunamadı (kesinti): veri yok, `isError`. */
  failed: false,
  refetch: vi.fn(),
  /** GERÇEK `useMyBids` (TanStack sorgusu) koşsun — çevrimdışı / duraklatılmış sorgu testi. */
  real: false,
  get: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(h.search),
  usePathname: () => "/company/satis/tekliflerim",
}));
vi.mock("@/lib/company-auth/api", () => ({ companyApi: { get: h.get } }));
vi.mock("@/hooks/use-company-listings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/use-company-listings")>();
  /** TanStack Query sonucunun bileşenin okuduğu kesiti (yanıt geldi ya da okunamadı). */
  const settled = () => ({
    data: h.failed ? undefined : h.page,
    isPending: false,
    isLoading: false,
    isError: h.failed,
    refetch: h.refetch,
  });
  return {
    useMyBids: (q: MyBidsQuery) => {
      h.calls.push(q);
      // Seçim test boyunca sabittir (kanca sırası değişmez).
      const query = h.real ? actual.useMyBids : settled;
      return query(q);
    },
  };
});

import { buildMyBidsQuery, MyBidsList, parseMyBidsUrl } from "../my-bids-list";

function bid(over: Partial<MyBid> = {}): MyBid {
  return {
    id: "b1",
    amount: "1000",
    currency: "TRY",
    amountTry: "1000",
    status: "SUBMITTED",
    round: 1,
    version: 3,
    submitCount: 1,
    createdAt: new Date().toISOString(),
    deliveryDate: null,
    deliveryTime: null,
    orderId: null,
    listing: {
      id: "l1",
      number: "ROT-000001",
      title: "Çelik boru alımı",
      type: "ALIM",
      status: "OPEN",
      closesAt: new Date(Date.now() + 3 * 86_400_000).toISOString(),
      ownerName: "QA Alıcı Sanayi A.Ş.",
    },
    ...over,
  };
}

function pageOf(items: MyBid[], over: Partial<MyBidsPage> = {}): MyBidsPage {
  return {
    items,
    total: items.length,
    page: 1,
    pageSize: 10,
    counts: { all: 327, active: 113, won: 214 },
    ...over,
  };
}

const lastCall = () => h.calls.at(-1) as MyBidsQuery;

beforeEach(() => {
  h.search = "";
  h.calls = [];
  h.page = pageOf([bid()]);
  h.failed = false;
  h.refetch.mockClear();
  h.real = false;
  h.get.mockReset();
  window.history.replaceState(null, "", "/company/satis/tekliflerim");
});
afterEach(() => {
  // Çevrimdışı testi ağı kapatır; sonraki testler çevrimiçi başlasın.
  onlineManager.setOnline(true);
});

/**
 * Canlı doğrulama OUT-2 (API kesintisi): hata kartının üstünde "0 teklif"
 * yazıyordu (aynı hesap az önce "418 teklif" gösteriyordu). Okunamayan toplam
 * 0 değildir; boş durum yalnız başarılı ve boş yanıtta.
 */
describe("MyBidsList — liste durumları (OUT-2)", () => {
  it("liste okunamadı: '0 teklif' ve 'Henüz teklif vermediniz' YOK; hata kartı + Tekrar dene", async () => {
    h.failed = true;
    const { container } = render(<MyBidsList />);
    expect(screen.getByRole("alert")).toHaveTextContent("Bir şeyler ters gitti");
    expect(container.textContent).not.toMatch(/\d+\s*teklif/);
    expect(screen.queryByText("Henüz teklif vermediniz")).toBeNull();
    await userEvent.setup().click(screen.getByRole("button", { name: "Tekrar dene" }));
    expect(h.refetch).toHaveBeenCalledTimes(1);
  });

  it("BAŞARILI ve boş yanıt: gerçek '0 teklif' + boş durum (hata kartı değil)", () => {
    h.page = pageOf([], { total: 0, counts: { all: 0, active: 0, won: 0 } });
    const { container } = render(<MyBidsList />);
    expect(container.textContent).toMatch(/0\s*teklif/);
    expect(screen.getByText("Henüz teklif vermediniz")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  /**
   * Gözden geçirme REV-2: cihaz çevrimdışıyken TanStack sorguyu DURAKLATIR —
   * istek gitmez, hata da olmaz (`isLoading` false, `isError` false, veri yok).
   * İskelet `isLoading`e bağlıyken yanıt hiç gelmediği hâlde "0 teklif" ve
   * "Henüz teklif vermediniz" çiziliyordu. Gerçek kanca + gerçek sorgu istemcisi.
   */
  it("cihaz çevrimdışı (sorgu duraklatıldı): '0 teklif' ve 'Henüz teklif vermediniz' YOK, iskelet; bağlantı dönünce liste gelir", async () => {
    h.real = true;
    h.get.mockResolvedValue({ data: pageOf([bid()]) });
    onlineManager.setOnline(false);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const { container } = render(
      <QueryClientProvider client={qc}>
        <MyBidsList />
      </QueryClientProvider>,
    );
    expect(container.textContent).not.toMatch(/\d+\s*teklif/);
    expect(screen.queryByText("Henüz teklif vermediniz")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(container.querySelector(".animate-pulse")).not.toBeNull();
    // Duraklatılan sorgu istek ATMAZ: ne hata ne yanıt var.
    expect(h.get).not.toHaveBeenCalled();

    act(() => onlineManager.setOnline(true));
    expect(await screen.findByRole("link", { name: "Çelik boru alımı" })).toBeInTheDocument();
    expect(h.get).toHaveBeenCalledWith("/company/listings/my-bids", expect.anything());
    qc.clear();
  });
});

/**
 * Son canlı kontrol 2026-10-10, OUTF-1: TanStack verisi olmayan sorguyu her
 * yeniden çekişte "pending"e döndürür (hata silinir) → 15 sn'lik yoklama hata
 * kartını her turda 5–7 sn iskelete çeviriyor, "Tekrar dene" kayboluyordu.
 * Gerçek kanca + gerçek sorgu istemcisi.
 */
describe("MyBidsList — kesinti sürerken yoklama (OUTF-1)", () => {
  const networkError = Object.assign(new Error("Network Error"), { isAxiosError: true });
  let qc: QueryClient;
  const listStatus = () => qc.getQueryCache().find({ queryKey: ["company-my-bids"], exact: false })?.state.status;
  const view = () =>
    render(
      <QueryClientProvider client={qc}>
        <MyBidsList />
      </QueryClientProvider>,
    );
  /** Liste isteği testin elinde bekler. */
  function holdList() {
    let settle!: { resolve: (page: MyBidsPage) => void; reject: (err: unknown) => void };
    h.get.mockImplementation(
      () =>
        new Promise((resolve, reject) => {
          settle = { resolve: (page) => resolve({ data: page }), reject };
        }),
    );
    return { resolve: (page: MyBidsPage) => settle.resolve(page), reject: () => settle.reject(networkError) };
  }

  beforeEach(() => {
    h.real = true;
    h.get.mockRejectedValue(networkError);
    qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });
  afterEach(() => qc.clear());

  it("yoklama yeniden denerken hata kartı ve 'Tekrar dene' ekranda KALIR; API dönünce liste gelir", async () => {
    const { container } = view();
    await screen.findByRole("alert");

    // 15 sn'lik yoklamanın yerine: sorgu arka planda yeniden çekilir ve asılı kalır.
    const pending = holdList();
    act(() => void qc.refetchQueries({ queryKey: ["company-my-bids"] }));
    await waitFor(() => expect(listStatus()).toBe("pending"));

    expect(screen.getByRole("alert")).toHaveTextContent("Bir şeyler ters gitti");
    expect(screen.getByRole("button", { name: "Tekrar dene" })).toBeInTheDocument();
    expect(container.querySelector(".animate-pulse")).toBeNull();
    expect(container.textContent).not.toMatch(/\d+\s*teklif/);
    expect(screen.queryByText("Henüz teklif vermediniz")).toBeNull();

    await act(async () => pending.resolve(pageOf([bid()])));
    expect(await screen.findByRole("link", { name: "Çelik boru alımı" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  /**
   * Gözden geçirme REV-OUTF-1: `useMyBids` süzgeç değişiminde önceki sayfayı yer
   * tutucu tutar (`keepPreviousData`). Verisi olmayan (düşmüş) sorgu yoklamayla
   * yeniden çekilirken `data` yine ÖNCEKİ süzgecin sayfası olur — yalnız `data`ya
   * bakan kanca bunu "okundu" sayıyor, kart ve "Tekrar dene" kayboluyor, yeni
   * süzgecin altında eski süzgecin satırları çiziliyordu (her 15 sn'de bir).
   */
  it("süzgeç değişip okuma düşünce: yoklama kartı ÖNCEKİ süzgecin satırlarına çevirmez; bu süzgecin verisi gelince liste gelir", async () => {
    const activeList = () =>
      qc.getQueryCache().findAll({ queryKey: ["company-my-bids"], type: "active" })[0]?.state;
    const lastParams = () => (h.get.mock.calls.at(-1)?.[1] as { params?: Record<string, string> } | undefined)?.params;

    // 1) Süzgeçsiz liste okundu.
    h.get.mockResolvedValue({ data: pageOf([bid()]) });
    const { container } = view();
    expect(await screen.findByRole("link", { name: "Çelik boru alımı" })).toBeInTheDocument();
    expect(screen.getByLabelText("Teklif özeti")).toBeInTheDocument();

    // 2) API düştü; kullanıcı arama yazdı. İstek sürerken önceki sayfa yer
    //    tutucudur (hata bilinmiyor: sıradan süzgeç değişimi eskisi gibi).
    const filtered = holdList();
    fireEvent.change(screen.getByPlaceholderText("Talep adı, numarası veya alıcı ara…"), {
      target: { value: "vana" },
    });
    await waitFor(() => expect(lastParams()).toMatchObject({ q: "vana" }), { timeout: 4000 });
    expect(screen.getByRole("link", { name: "Çelik boru alımı" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
    await act(async () => filtered.reject());
    expect(await screen.findByRole("alert")).toHaveTextContent("Bir şeyler ters gitti");
    expect(screen.queryByRole("link", { name: "Çelik boru alımı" })).toBeNull();

    // 3) 15 sn'lik yoklamanın yerine: süzgeçli sorgu yeniden çekilir ve asılı kalır.
    const poll = holdList();
    act(() => void qc.refetchQueries({ queryKey: ["company-my-bids"], type: "active" }));
    await waitFor(() => expect(activeList()).toMatchObject({ status: "pending", fetchStatus: "fetching" }));

    // Eskiden bu anda: kart yok, "Çelik boru alımı" (süzgeçsiz sayfa) "vana" aramasının altında.
    expect(screen.getByRole("alert")).toHaveTextContent("Bir şeyler ters gitti");
    expect(screen.getByRole("button", { name: "Tekrar dene" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Çelik boru alımı" })).toBeNull();
    // Yer tutucunun sayaçları da kartın üstünde belirmez.
    expect(screen.queryByLabelText("Teklif özeti")).toBeNull();
    expect(container.textContent).not.toMatch(/\d+\s*teklif/);

    // 4) API döndü: kart yalnız BU süzgecin kendi verisiyle kalkar.
    const vana = bid({ id: "b2", listing: { ...bid().listing, id: "l2", title: "Küresel vana alımı" } });
    await act(async () => poll.resolve(pageOf([vana])));
    expect(await screen.findByRole("link", { name: "Küresel vana alımı" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByLabelText("Teklif özeti")).toBeInTheDocument();
  });

  it("kullanıcının bastığı 'Tekrar dene' görünür: istek sürerken iskelet, yine düşerse hata kartı", async () => {
    const { container } = view();
    await screen.findByRole("alert");

    const pending = holdList();
    await userEvent.setup().click(screen.getByRole("button", { name: "Tekrar dene" }));
    await waitFor(() => expect(container.querySelector(".animate-pulse")).not.toBeNull());
    expect(screen.queryByRole("alert")).toBeNull();

    await act(async () => pending.reject());
    expect(await screen.findByRole("alert")).toHaveTextContent("Bir şeyler ters gitti");
  });
});

describe("MyBidsList — sunucu tarafı sayfa/süzgeç (O-005)", () => {
  it("sayaçlar sunucunun `counts`undan — listedeki satır sayısından değil", () => {
    render(<MyBidsList />);
    const ozet = screen.getByLabelText("Teklif özeti");
    expect(ozet).toHaveTextContent("113 karar bekleyen · 214 kazanılan");
  });

  it("URL süzgeci sorguya gider: KPI ?status=WON,AWARDED_PARTIAL, sayfa/sıralama/aralık taşınır", () => {
    h.search = "status=WON,AWARDED_PARTIAL&page=3&sort=amount&range=30&q=boru";
    h.page = pageOf([bid()], { total: 45, page: 3 });
    render(<MyBidsList />);
    expect(lastCall()).toMatchObject({
      status: ["WON", "AWARDED_PARTIAL"],
      page: 3,
      sort: "amount",
      days: 30,
      q: "boru",
      pending: false,
      pageSize: 10,
    });
  });

  it("KPI ?pending=1 → karar bekleyen süzgeci; çip kaldırılınca URL'den düşer (D-120)", async () => {
    const user = userEvent.setup();
    h.search = "pending=1";
    window.history.replaceState(null, "", "/company/satis/tekliflerim?pending=1");
    render(<MyBidsList />);
    expect(lastCall()).toMatchObject({ pending: true });
    await user.click(screen.getByRole("button", { name: "Karar bekleyen filtresini kaldır" }));
    expect(lastCall()).toMatchObject({ pending: false });
    expect(window.location.search).toBe("");
  });

  it("yalnız 'Kazandı' süzgeci geri dönüşte aynen gelir — Kısmen Kazandı eklenmez (D-120)", () => {
    h.search = "status=WON&page=2";
    h.page = pageOf([bid()], { total: 25, page: 2 });
    render(<MyBidsList />);
    expect(lastCall()).toMatchObject({ status: ["WON"], page: 2 });
  });

  it("sayfa değişimi URL'ye yazılır; detay bağlantısı süzgeçli listeye döner", async () => {
    const user = userEvent.setup();
    h.search = "status=LOST";
    h.page = pageOf([bid()], { total: 25 });
    render(<MyBidsList />);
    await user.click(screen.getByRole("button", { name: /^2$/ }));
    expect(lastCall()).toMatchObject({ page: 2, status: ["LOST"] });
    expect(window.location.search).toBe("?status=LOST&page=2");
    const href = screen.getByRole("link", { name: "Çelik boru alımı" }).getAttribute("href") ?? "";
    expect(decodeURIComponent(href)).toContain("from=/company/satis/tekliflerim?status=LOST&page=2");
  });
});

describe("MyBidCard", () => {
  it("'Alıcı: <ad>' boşluklu (D-148); taslak kayıtlarıyla artan version revizyon sayılmaz (O-036)", () => {
    render(<MyBidsList />);
    expect(screen.getByText("Alıcı: QA Alıcı Sanayi A.Ş.")).toBeInTheDocument();
    expect(screen.queryByText(/Revizyon/)).toBeNull();
  });

  it("ikinci gönderim 'Revizyon 2' gösterir", () => {
    h.page = pageOf([bid({ submitCount: 2, version: 5 })]);
    render(<MyBidsList />);
    expect(screen.getByText("Revizyon 2")).toBeInTheDocument();
  });
});

describe("MyBidCard — LOST sebebi (arayüz testi D-102)", () => {
  it("yalnız elenen 'Elendi'; kazandırmada kaybeden 'Kaybetti', kazanansız kapanan 'Kapandı', iptal 'İptal edildi'", () => {
    const closed = { closesAt: null } as const;
    h.page = pageOf([
      bid({ id: "e", status: "LOST", eliminatedAt: "2026-09-30T10:00:00.000Z", listing: { ...bid().listing, id: "le", title: "Elenen" } }),
      bid({ id: "a", status: "LOST", eliminatedAt: null, listing: { ...bid().listing, ...closed, id: "la", title: "Kazandırılan", status: "AWARDED" } }),
      bid({ id: "n", status: "LOST", eliminatedAt: null, listing: { ...bid().listing, ...closed, id: "ln", title: "Kazanansız", status: "CLOSED_NO_AWARD" } }),
      bid({ id: "c", status: "LOST", eliminatedAt: null, listing: { ...bid().listing, ...closed, id: "lc", title: "İptal", status: "CANCELLED" } }),
      // Satıcının kendi sipariş reddi (eliminatedAt dolu) — "Elendi" değil (son tur).
      bid({ id: "r", status: "LOST", eliminatedAt: "2026-09-30T10:00:00.000Z", orderRejected: true, listing: { ...bid().listing, ...closed, id: "lr", title: "Reddedilen", status: "AWARDED" } }),
    ]);
    render(<MyBidsList />);
    const badgeOf = (title: string) =>
      screen.getByRole("link", { name: title }).closest("div.group")?.querySelector("span.rounded-full")?.textContent;
    expect(badgeOf("Elenen")).toBe("Elendi");
    expect(badgeOf("Kazandırılan")).toBe("Kaybetti");
    expect(badgeOf("Kazanansız")).toBe("Kapandı");
    expect(badgeOf("İptal")).toBe("İptal edildi");
    expect(badgeOf("Reddedilen")).toBe("Siparişi reddettiniz");
  });
});

describe("URL ayrıştırıcı / üretici", () => {
  it("bilinmeyen değerler atılır, varsayılanlar adrese yazılmaz", () => {
    const s = parseMyBidsUrl(new URLSearchParams("status=BOGUS,LOST&sort=x&range=12&page=-1"));
    expect(s).toEqual({ status: ["LOST"], pending: false, q: "", sort: "newest", range: "all", page: 1 });
    expect(buildMyBidsQuery(s)).toBe("?status=LOST");
    expect(buildMyBidsQuery({ ...s, status: [] })).toBe("");
  });
});
