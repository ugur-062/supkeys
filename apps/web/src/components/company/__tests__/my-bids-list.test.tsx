// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(h.search),
  usePathname: () => "/company/satis/tekliflerim",
}));
vi.mock("@/hooks/use-company-listings", () => ({
  useMyBids: (q: MyBidsQuery) => {
    h.calls.push(q);
    return { data: h.page, isLoading: false, isError: false, refetch: vi.fn() };
  },
}));

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
  window.history.replaceState(null, "", "/company/satis/tekliflerim");
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
    ]);
    render(<MyBidsList />);
    const badgeOf = (title: string) =>
      screen.getByRole("link", { name: title }).closest("div.group")?.querySelector("span.rounded-full")?.textContent;
    expect(badgeOf("Elenen")).toBe("Elendi");
    expect(badgeOf("Kazandırılan")).toBe("Kaybetti");
    expect(badgeOf("Kazanansız")).toBe("Kapandı");
    expect(badgeOf("İptal")).toBe("İptal edildi");
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
