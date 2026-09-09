// @vitest-environment jsdom
/**
 * FİRMA DİZİNİ SÜZGEÇLERİ — sözleşme: seçili kategori facet listesinde YOKSA
 * (0 firmalı dal; ürün sekmesinden geçişte olağan) çip ve kenar süzgeci ham
 * KODU değil `categories/by-ids`ten çözülen ADI basar (2026-09-10 bulgusu:
 * "Süzgeçler: 42181500").
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/firmalar",
}));
vi.mock("@/hooks/use-categories", () => ({
  useCategoriesByIds: (ids: string[]) => ({
    data: ids.includes("42181500") ? [{ id: "42181500", code: "42181500", nameTr: "Tanı ve teşhis cihazları", level: 3, breadcrumb: "" }] : [],
  }),
}));

import { CompanyActiveChips, CompanyFilters } from "../company-filters";
import { FilterShellCore } from "../filter-shell";
import type { CompanyFilterState } from "@/lib/public/company-filter-params";
import type { PublicDirectoryFacets } from "@/lib/public/marketplace-api";

const facets: PublicDirectoryFacets = {
  total: 0,
  verified: 0,
  withProducts: 0,
  cities: [],
  activities: [],
  categories: [{ id: "39000000", name: "Elektrik", count: 3 }],
};
const state: CompanyFilterState = { q: "", page: 1, sort: "onerilen", verified: false, hasProducts: false, gold: false, activities: [], cities: [], categories: ["42181500", "39000000"] } as unknown as CompanyFilterState;

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <FilterShellCore<CompanyFilterState> state={state} toUrl={() => "/firmalar"} clearState={(s) => s} total={0} activeCount={2}>
        {ui}
      </FilterShellCore>
    </QueryClientProvider>,
  );
}

describe("CompanyFilters — kategori adı", () => {
  it("facet'te olmayan seçili kategori çipte ve kenar süzgecinde ADIYLA görünür, kod basılmaz", () => {
    wrap(
      <>
        <CompanyActiveChips facets={facets} />
        <CompanyFilters facets={facets} idPrefix="t" />
      </>,
    );
    expect(screen.getAllByText("Tanı ve teşhis cihazları").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("Elektrik").length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText("42181500")).toBeNull();
    // Kenar süzgecinde 0 firmalı dal tikli ki kaldırılabilsin
    const missing = screen.getByRole("checkbox", { name: /Tanı ve teşhis cihazları/ }) as HTMLInputElement;
    expect(missing.checked).toBe(true);
    expect(within(screen.getByText("Süzgeçler:").parentElement as HTMLElement).getByRole("button", { name: "Tanı ve teşhis cihazları süzgecini kaldır" })).toBeInTheDocument();
  });
});
