// @vitest-environment jsdom
/**
 * AÇIK TALEPLER — liste durumları (canlı doğrulama 2026-10-09, OUTR-1 / OUTR-5).
 *
 * GERÇEK `useSellerTenders` kancası + gerçek QueryClient; yalnız `companyApi`
 * sahte. Kesintide ekran "Davet edildim 0 · Aktif 0 · Tümü 0", "Açık talep
 * bulunamadı", "Eşleşen kategori yok", "Seçenek yok" diyordu (aynı hesapta
 * sağlıklı değerler: Aktif 16, "16 açık talep bulundu"); açık sayfada 15 sn'lik
 * yoklama düşünce de satırlar "Açık talepler yüklenemedi."ye dönüyordu.
 */
import { QueryClient, QueryClientProvider, onlineManager } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SellerTenderRow } from "@/hooks/use-seller-tenders";

const h = vi.hoisted(() => ({
  get: vi.fn<(url: string) => Promise<{ data: unknown }>>(),
  search: "",
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(h.search),
  usePathname: () => "/company/satis",
}));
vi.mock("@/lib/company-auth/api", () => ({ companyApi: { get: h.get } }));

import { SellerTendersView } from "../seller-tenders-view";
import { useCompanyAuthStore } from "@/lib/company-auth/store";

const networkError = Object.assign(new Error("Network Error"), { isAxiosError: true });

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
    categories: [{ code: "31161500", name: "Vidalar" }],
    extraCategoryCount: 0,
    ...over,
  };
}

/** API ayakta: liste `rows`, segment adları sabit. */
function apiUp(rows: SellerTenderRow[]) {
  h.get.mockImplementation(async (url: string) => {
    if (url.startsWith("/company/listings/seller-tenders")) return { data: rows };
    if (url.startsWith("/categories/segments")) return { data: [{ id: "31000000", nameTr: "İmalat Bileşenleri" }] };
    return { data: [] };
  });
}
const apiDown = () => h.get.mockRejectedValue(networkError);

let client: QueryClient;
const view = () =>
  render(
    <QueryClientProvider client={client}>
      <SellerTendersView />
    </QueryClientProvider>,
  );

/** Kesintinin ekrana sıfır / "yok" diye yansıdığı metinler. */
const FALSE_EMPTY = [
  "Açık talep bulunamadı",
  "Eşleşen kategori yok",
  "Alıcı adı görünen talep yok",
  "Seçenek yok",
  "Sonuç bulunamadı.",
];
const expectNoFalseEmpty = () => {
  for (const text of FALSE_EMPTY) expect(screen.queryByText(text)).toBeNull();
  expect(screen.queryByText(/henüz .*yok|şu anda aktif .*yok/i)).toBeNull();
};

beforeEach(() => {
  seq = 0;
  h.search = "";
  h.get.mockReset();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  useCompanyAuthStore.setState({ company: { tier: "SILVER", companyVerificationStatus: "VERIFIED" } as never });
});
afterEach(() => {
  onlineManager.setOnline(true);
  client.clear();
});

describe("SellerTendersView — kesinti (OUTR-1)", () => {
  it("liste okunamadıysa tek hata kartı: sıfır sayaç, '… bulunamadı' ve 'Seçenek yok' YOK", async () => {
    apiDown();
    view();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Açık talepler yüklenemedi.");
    expectNoFalseEmpty();
    // Sayaçlı süzgeç grupları hiç çizilmez (eskiden hepsi 0 ile duruyordu).
    expect(screen.queryByRole("complementary", { name: "Süzgeçler" })).toBeNull();
    expect(screen.queryByRole("radio")).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
    // Sonuç satırı ve sıralama da yok — okunamayan listede sıralanacak şey yok.
    expect(screen.queryByText(/bulundu/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Size uygun" })).toBeNull();
  });

  it("'Tekrar dene' listeyi yeniden ister; API dönünce satırlar ve gerçek sayılar gelir", async () => {
    apiDown();
    view();
    await screen.findByRole("alert");
    apiUp([row(), row()]);
    await userEvent.setup().click(screen.getByRole("button", { name: "Tekrar dene" }));
    expect(await screen.findByText("2 açık talep bulundu")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("complementary", { name: "Süzgeçler" })).toBeInTheDocument();
  });

  it("süzgeç uygulanmışken de kesinti 'Sonuç bulunamadı' + 'Filtreleri temizle'ye dönmez", async () => {
    h.search = "q=kablo&durum=tumu";
    apiDown();
    view();
    await screen.findByRole("alert");
    expectNoFalseEmpty();
    expect(screen.queryByRole("button", { name: "Filtreleri temizle" })).toBeNull();
  });
});

describe("SellerTendersView — yanıt beklenirken", () => {
  it("çevrimdışı duraklayan sorgu (istek yok, hata yok, veri yok) boş liste sanılmaz", async () => {
    // TanStack çevrimdışıyken sorguyu DURAKLATIR: `isLoading` false, `isError`
    // false. İskelet `isLoading`e bağlıyken boş durum çiziliyordu.
    onlineManager.setOnline(false);
    apiDown();
    const { container } = view();
    await act(async () => {});
    expect(h.get).not.toHaveBeenCalled();
    expectNoFalseEmpty();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText("Güncelleniyor…")).toBeInTheDocument();
    expect(screen.getByText("Süzgeçler yükleniyor…")).toBeInTheDocument();
    expect(container.querySelector(".animate-pulse")).not.toBeNull();
  });

  it("başarılı ve BOŞ yanıt boş durumu çizer (boş durum yalnız buradan)", async () => {
    apiUp([]);
    view();
    expect(await screen.findByRole("link", { name: "Satış kategorilerini düzenle" })).toBeInTheDocument();
    expect(screen.getByText("Açık talep bulunamadı")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("SellerTendersView — arka plan yoklaması düşünce (OUTR-5)", () => {
  it("ekrandaki satırlar ve sayılar kalır; hata kartı çıkmaz", async () => {
    apiUp([row({ title: "Vida alımı" }), row({ title: "Somun alımı" })]);
    view();
    expect(await screen.findByText("2 açık talep bulundu")).toBeInTheDocument();
    expect(screen.getAllByText(/Vida alımı/).length).toBeGreaterThan(0);

    // API gitti: 15 sn'lik yoklamanın yerine sorgu elle yenilenir.
    apiDown();
    await act(async () => {
      await client.refetchQueries({ queryKey: ["company-listings", "seller-tenders"] });
    });
    await waitFor(() =>
      expect(client.getQueryCache().find({ queryKey: ["company-listings", "seller-tenders"], exact: false })?.state.status).toBe(
        "error",
      ),
    );

    expect(screen.queryByText("Açık talepler yüklenemedi.")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getAllByText(/Vida alımı/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Somun alımı/).length).toBeGreaterThan(0);
    expect(screen.getByText("2 açık talep bulundu")).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "Süzgeçler" })).toBeInTheDocument();
  });
});
