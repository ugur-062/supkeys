// @vitest-environment jsdom
/**
 * Kalem Kataloğu arşivle düğmesi (derin denetim S066): uç `templates:manage`
 * VEYA `sell:product:manage` kabul eder; vitrine dokunmuş ürün yalnız satış
 * izniyle arşivlenir. Düğme eskiden yalnız `templates:manage`'e bakıyordu ve
 * uç `sell:product:manage` istediği için Satın Almacı her tıklamada 403 alıyordu.
 */
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CatalogItem } from "@/hooks/use-company-items";

const h = vi.hoisted(() => ({
  perms: [] as string[],
  items: [] as unknown[],
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
    useCatalogItems: () => ({ data: { items: h.items, total: h.items.length } }),
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
