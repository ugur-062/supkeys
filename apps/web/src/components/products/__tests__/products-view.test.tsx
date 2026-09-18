// @vitest-environment jsdom
/**
 * Ürünlerim listesi — satır içeriği + sekme sayaçları (2026-09-03).
 *
 * Kilit: satır durum rozetini (Taslak/Yayında), fiyat modunu ve kategoriyi
 * taşır; sekme sayaçları SUNUCUNUN firma-geneli `counts`undan gelir (arama
 * daraltınca değişmez); sekme yalnız istemcide süzer.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn() }));

// Ürün ekleme düğmeleri "Ürün ve vitrin yönetimi" iznine kapılı (yetki tablosu).
vi.mock("@/hooks/use-company-auth", () => ({
  useHasCompanyPermission: () => true,
  useCompanyAuth: () => ({ user: { roles: ["SATISCI"], permissions: ["sell:product:manage"] }, company: null }),
}));
vi.mock("@/lib/company-auth/api", () => ({
  companyApi: { get: h.get, post: vi.fn(), patch: h.patch },
}));
vi.mock("@/lib/api", () => ({
  api: { get: h.get },
}));
vi.mock("../product-showcase-form", () => ({
  // Kaydetmeyi taklit eden düğme: sayfanın `onSaved` ile gelen SUNUCU kaydını
  // ekrana işleyip işlemediği sınanır.
  ProductShowcaseForm: (props: { product: { id: string }; onSaved?: (saved: unknown) => void }) => (
    <div data-testid="form">
      <button
        type="button"
        onClick={() => props.onSaved?.({ ...props.product, reviewStatus: "PENDING", isPublic: true })}
      >
        sahte-kaydet
      </button>
    </div>
  ),
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

beforeEach(() => {
  h.get.mockReset();
  h.patch.mockReset();
  h.get.mockImplementation((url: string) => {
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
    return Promise.resolve({
      data: { items: ITEMS, total: 4, truncated: false, counts: { published: 1, draft: 1, pending: 1, rejected: 1 } },
    });
  });
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

  it("tablo yatay kaydırmaz: kapsayıcıda overflow-x-auto / min-w yok, dar sütunlar kesme noktasıyla gizli", async () => {
    wrap(<ProductsView />);
    await screen.findByText("Dağıtım panosu");
    const table = screen.getByRole("table");
    expect(table.className).not.toMatch(/min-w-/);
    expect(table.parentElement?.className).not.toMatch(/overflow-x-auto/);
    const heads = screen.getAllByRole("columnheader").map((h) => [h.textContent, h.className] as const);
    expect(heads.find(([t]) => t === "Eklenme")?.[1]).toMatch(/hidden 2xl:table-cell/);
    expect(heads.find(([t]) => t === "Görüntülenme")?.[1]).toMatch(/hidden xl:table-cell/);
    expect(heads.find(([t]) => t === "Ürün")?.[1]).not.toMatch(/hidden/);
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
    h.get.mockImplementation((url: string) => {
      if (url.includes("/categories/by-ids")) return Promise.resolve({ data: [] });
      // 1 ürün: yayında + yeniden incelemede → sunucu published 1, pending 1 sayar.
      const item = { ...ITEMS[0], reviewStatus: "PENDING" };
      return Promise.resolve({ data: { items: [item], total: 1, truncated: false, counts: { published: 1, draft: 0, pending: 1, rejected: 0 } } });
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

  it("başlıkta TEK eylem 'Yeni ürün'; toplu ekleme KALDIRILDI (2026-09-15)", async () => {
    wrap(<ProductsView />);
    await screen.findByText("Dağıtım panosu");
    expect(screen.getByRole("button", { name: "Yeni ürün" }).className).toContain("bg-emerald-600");
    // Excel şablonu görselsiz ürün üretiyordu, katalog çıkarımı çalışmıyordu.
    expect(screen.queryByRole("button", { name: /Toplu ekle/ })).toBeNull();
  });
});
