// @vitest-environment jsdom
/**
 * Kalem Kataloğu arşivle düğmesi (derin denetim S066): uç `templates:manage`
 * VEYA `sell:product:manage` kabul eder; vitrine dokunmuş ürün yalnız satış
 * izniyle arşivlenir. Düğme eskiden yalnız `templates:manage`'e bakıyordu ve
 * uç `sell:product:manage` istediği için Satın Almacı her tıklamada 403 alıyordu.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CatalogItem } from "@/hooks/use-company-items";

const h = vi.hoisted(() => ({
  perms: [] as string[],
  items: [] as unknown[],
  status: "success" as "success" | "loading" | "paused" | "error",
  refetch: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/company-auth/api", () => ({
  companyApi: { get: vi.fn(), patch: vi.fn() },
}));
vi.mock("@/hooks/use-company-auth", () => ({
  useHasCompanyPermission: (p: string) => h.perms.includes(p),
}));
vi.mock("@/hooks/use-company-items", async (orig) => {
  const real = await orig<typeof import("@/hooks/use-company-items")>();
  return {
    ...real,
    useCatalogItems: () =>
      h.status === "success"
        ? { data: { items: h.items, total: h.items.length }, isLoading: false, isPending: false, isError: false, refetch: h.refetch }
        : {
            data: undefined,
            // Çevrimdışı duraklama: istek yok (`isLoading` false) ama yanıt da yok (`isPending`).
            isLoading: h.status === "loading",
            isPending: h.status === "loading" || h.status === "paused",
            isError: h.status === "error",
            refetch: h.refetch,
          },
  };
});

import { CatalogItemsView } from "../catalog-items-view";

function item(over: Partial<CatalogItem>): CatalogItem {
  return {
    id: "i1",
    code: null,
    name: "Kalem",
    description: null,
    specification: null,
    unit: "adet",
    unitCode: null,
    categoryId: null,
    brand: null,
    mpn: null,
    targetPrice: null,
    isActive: true,
    usageCount: 0,
    lastUsedAt: null,
    isPublic: false,
    publishedAt: null,
    reviewStatus: "DRAFT",
    rejectReason: null,
    thumbnailUrl: null,
    priceMode: "ON_REQUEST",
    ...over,
  } as CatalogItem;
}

function renderView() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <CatalogItemsView basePath="/company/satinalma/sablonlar" />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  h.status = "success";
  h.refetch.mockReset();
  h.perms = [];
  h.items = [
    item({ id: "a", name: "Katalog kalemi" }),
    item({ id: "b", name: "Vitrin ürünü", isPublic: true, reviewStatus: "APPROVED" }),
  ];
});

describe("CatalogItemsView — arşivle izni", () => {
  it("templates:manage: katalog kaleminde düğme var, vitrin ürününde yok", () => {
    h.perms = ["templates:manage"];
    renderView();
    expect(screen.getAllByRole("button", { name: /Arşivle/ })).toHaveLength(1);
  });

  it("sell:product:manage (templates:manage olmadan) iki satırda da düğme görür", () => {
    h.perms = ["sell:product:manage"];
    renderView();
    expect(screen.getAllByRole("button", { name: /Arşivle/ })).toHaveLength(2);
  });

  it("iki izin de yoksa düğme yok", () => {
    renderView();
    expect(screen.queryByRole("button", { name: /Arşivle/ })).not.toBeInTheDocument();
  });
});

describe("CatalogItemsView — yükleme/hata boş katalog sanılmaz (derin denetim S066)", () => {
  it("yüklenirken 'Katalog henüz boş' çizilmez", () => {
    h.status = "loading";
    renderView();
    expect(screen.queryByText(/Katalog henüz boş/)).toBeNull();
  });

  it("çevrimdışı duraklayan sorguda (istek yok, hata yok, veri yok) da boş katalog çizilmez", () => {
    // `isLoading` false kalır; eskiden iskelet ona bağlıydı ve "Katalog henüz
    // boş" çiziliyordu (LİSTE DURUMLARI — iskelet `isPending`e bağlı).
    h.status = "paused";
    renderView();
    expect(screen.queryByText(/Katalog henüz boş/)).toBeNull();
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
  });

  it("hata verince yeniden dene seçeneği çizilir, boş durum çizilmez", () => {
    h.status = "error";
    renderView();
    expect(screen.queryByText(/Katalog henüz boş/)).toBeNull();
    expect(screen.getByRole("alert")).toHaveTextContent("Katalog yüklenemedi");
    fireEvent.click(screen.getByRole("button", { name: /Tekrar dene/i }));
    expect(h.refetch).toHaveBeenCalled();
  });

  it("başarılı ve boş yanıtta boş durum çizilir", () => {
    h.items = [];
    renderView();
    expect(screen.getByText(/Katalog henüz boş/)).toBeInTheDocument();
  });
});

describe("CatalogItemsView — eşleşmeyen arama (arayüz testi D-047)", () => {
  it("arama varken boş sonuç 'Katalog henüz boş' değil 'Eşleşen kalem yok' + temizle", async () => {
    h.items = [];
    renderView();
    fireEvent.change(screen.getByPlaceholderText(/Kalem adı/), { target: { value: "zzqqxx" } });
    expect(await screen.findByText("Eşleşen kalem yok")).toBeInTheDocument();
    expect(screen.queryByText(/Katalog henüz boş/)).toBeNull();
    const clear = screen.getAllByRole("button", { name: "Aramayı temizle" });
    fireEvent.click(clear[clear.length - 1]!);
    expect(await screen.findByText(/Katalog henüz boş/)).toBeInTheDocument();
  });
});
