// @vitest-environment jsdom
/**
 * ŞEHİR SÜZGECİ ETİKETİ (canlı öncesi, staging bulgusu): facet listesinde
 * olmayan SEÇİLİ dünya şehri kenar çubuğunda ham adresle ("de-munich 0")
 * görünürken çip "Münih, Almanya" yazıyordu — `labelFor` yalnız Türk illerini
 * bilen `useCityKeyLabel`dı. Ürün, firma ve talep süzgeçleri aynı ad
 * çözümünü (`useCityFilterLabel` → facet adı → Türk il → API) kullanır.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/urunler",
}));
vi.mock("@/hooks/use-categories", () => ({ useCategoriesByIds: () => ({ data: [] }) }));
const geo = vi.hoisted(() => ({
  fetchGeoCityClient: vi.fn(async (slug: string) =>
    slug === "de-munich" ? { id: 1, slug, name: "Münih", countryCode: "DE", countryName: "Almanya" } : null,
  ),
  searchGeoCities: vi.fn(async () => []),
}));
vi.mock("@/lib/public/geo-client", () => geo);

import { CompanyActiveChips, CompanyFilters } from "../company-filters";
import { FilterShellCore } from "../filter-shell";
import { ListingActiveChips, ListingFilters } from "../listing-filters";
import { ActiveFilterChips, ProductFilters } from "../product-filters";
import { parseCompanyFilters } from "@/lib/public/company-filter-params";
import { parseListingFilters } from "@/lib/public/listing-filter-params";
import { parseProductFilters } from "@/lib/public/product-filter-params";
import type { ProductFacets, PublicDirectoryFacets, PublicFacets } from "@/lib/public/marketplace-api";

function wrap<S extends { page: number }>(state: S, ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <FilterShellCore<S> state={state} toUrl={() => "/"} clearState={(s) => s} total={0} activeCount={1}>
        {ui}
      </FilterShellCore>
    </QueryClientProvider>,
  );
}

/** Kenar çubuğundaki seçili şehir satırının görünen metni. */
function railLabel(id: string): string {
  const input = document.getElementById(id);
  expect(input).not.toBeNull();
  return input!.closest("label")?.textContent ?? "";
}

const sp = new URLSearchParams("sehir=de-munich&sehir=ankara");

describe("şehir süzgeci — facet'te olmayan seçili dünya şehri", () => {
  it("ürün süzgeci: kenar çubuğu çiple aynı adı yazar, ham adres basılmaz", async () => {
    const facets = { categories: [], cities: [], activities: [], verified: 0, price: { has: 0, request: 0 }, attributes: [], truncated: false } as unknown as ProductFacets;
    wrap(
      parseProductFilters(new URLSearchParams("sehir=de-munich,ankara")),
      <>
        <ActiveFilterChips facets={facets} />
        <ProductFilters facets={facets} idPrefix="t" />
      </>,
    );
    await waitFor(() => expect(railLabel("t-city-de-munich")).toContain("Münih, Almanya"));
    expect(railLabel("t-city-ankara")).toContain("Ankara");
    expect(screen.getAllByText("Münih, Almanya").length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText(/de-munich/)).toBeNull();
  });

  it("firma süzgeci: kenar çubuğu ve çip adıyla", async () => {
    const facets = { total: 0, verified: 0, withProducts: 0, cities: [], activities: [], categories: [] } as unknown as PublicDirectoryFacets;
    wrap(
      parseCompanyFilters(sp),
      <>
        <CompanyActiveChips facets={facets} />
        <CompanyFilters facets={facets} idPrefix="t" />
      </>,
    );
    await waitFor(() => expect(railLabel("t-city-de-munich")).toContain("Münih, Almanya"));
    expect(screen.getAllByText("Münih, Almanya").length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText(/de-munich/)).toBeNull();
  });

  it("talep süzgeci: kenar çubuğu ve çip adıyla", async () => {
    const facets = { categories: [], cities: [], countries: [] } as unknown as PublicFacets;
    wrap(
      parseListingFilters(sp),
      <>
        <ListingActiveChips facets={facets} />
        <ListingFilters facets={facets} idPrefix="t" />
      </>,
    );
    await waitFor(() => expect(railLabel("t-city-de-munich")).toContain("Münih, Almanya"));
    expect(screen.getAllByText("Münih, Almanya").length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText(/de-munich/)).toBeNull();
  });

  it("facet adı varsa API'ye gidilmeden o ad kullanılır", () => {
    geo.fetchGeoCityClient.mockClear();
    const facets = { total: 0, verified: 0, withProducts: 0, cities: [{ city: "fr-lyon", name: "Lyon, Fransa", count: 2 }], activities: [], categories: [] } as unknown as PublicDirectoryFacets;
    wrap(parseCompanyFilters(new URLSearchParams("sehir=fr-lyon")), <CompanyActiveChips facets={facets} />);
    expect(screen.getByText("Lyon, Fransa")).toBeInTheDocument();
    expect(geo.fetchGeoCityClient).not.toHaveBeenCalled();
  });
});
