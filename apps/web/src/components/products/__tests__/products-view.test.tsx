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

const h = vi.hoisted(() => ({ get: vi.fn() }));

// Ürün ekleme düğmeleri "Ürün ve vitrin yönetimi" iznine kapılı (yetki tablosu).
vi.mock("@/hooks/use-company-auth", () => ({
  useHasCompanyPermission: () => true,
  useCompanyAuth: () => ({ user: { roles: ["SATISCI"], permissions: ["sell:product:manage"] }, company: null }),
}));
vi.mock("@/lib/company-auth/api", () => ({
  companyApi: { get: h.get, post: vi.fn(), patch: vi.fn() },
}));
vi.mock("@/lib/api", () => ({
  api: { get: h.get },
}));
vi.mock("../import-dialog", () => ({
  ImportDialog: () => null,
}));
vi.mock("../product-showcase-form", () => ({
  ProductShowcaseForm: () => <div data-testid="form" />,
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
    thumbnailUrl: null,
    priceMode: "ON_REQUEST",
    updatedAt: "2026-09-03T10:00:00.000Z",
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
  h.get.mockImplementation((url: string) => {
    if (url.includes("/categories/by-ids")) {
      return Promise.resolve({
        data: [{ id: "39121600", code: "39121600", nameTr: "Dağıtım panoları", level: 3, breadcrumb: "" }],
      });
    }
    return Promise.resolve({
      data: { items: ITEMS, total: 2, truncated: false, counts: { published: 1, draft: 1 } },
    });
  });
});

describe("ProductsView", () => {
  it("satır: durum rozeti, fiyat modu, kategori adı", async () => {
    wrap(<ProductsView />);
    expect(await screen.findByText("Dağıtım panosu")).toBeInTheDocument();
    // Rozetler LİSTEDE (sekme adlarıyla aynı sözcük — kapsamı daralt).
    const list = screen.getByRole("list");
    expect(within(list).getByText("Yayında")).toBeInTheDocument();
    expect(within(list).getByText("Taslak")).toBeInTheDocument();
    expect(await screen.findByText(/Dağıtım panoları · Kademeli · adet/)).toBeInTheDocument();
    expect(screen.getByText(/Kategori seçilmedi · Teklif isteyin · m/)).toBeInTheDocument();
  });

  it("sekmeler sunucu sayaçlarını taşır ve listeyi süzer", async () => {
    const user = userEvent.setup();
    wrap(<ProductsView />);
    await screen.findByText("Dağıtım panosu");
    const tabs = screen.getByRole("tablist");
    expect(within(tabs).getByRole("tab", { name: /Tümü\s*2/ })).toBeInTheDocument();
    expect(within(tabs).getByRole("tab", { name: /Yayında\s*1/ })).toBeInTheDocument();

    await user.click(within(tabs).getByRole("tab", { name: /Taslak\s*1/ }));
    expect(screen.queryByText("Dağıtım panosu")).toBeNull();
    expect(screen.getByText("Kablo kanalı")).toBeInTheDocument();
  });

  it("başlıkta tek primary: 'Yeni ürün'; 'Toplu ekle' ikincil", async () => {
    wrap(<ProductsView />);
    await screen.findByText("Dağıtım panosu");
    const primary = screen.getByRole("button", { name: "Yeni ürün" });
    const secondary = screen.getByRole("button", { name: "Toplu ekle" });
    expect(primary.className).toContain("bg-zinc-950");
    expect(secondary.className).not.toContain("bg-zinc-950");
  });
});
