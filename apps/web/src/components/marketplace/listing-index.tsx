import { ListingFilterShell } from "./list-filter-shells";
import { FilterResults, MobileFilterButton, ResultCount } from "./filter-shell";
import { ListingActiveChips, ListingFilters, ListingSortBar } from "./listing-filters";
import { ListingTeaserCard } from "./listing-teaser-card";
import { PublicEmptyState } from "./public-empty-state";
import { PublicListPage, ResultGrid } from "./public-list-page";
import { Pagination } from "@/components/ui/pagination";
import {
  activeListingFilterCount,
  buildListingFilterQuery,
  parseListingFilters,
  toListingListParams,
} from "@/lib/public/listing-filter-params";
import { MARKETPLACE_LABELS, MARKETPLACE_ROUTES, type PublicListingType } from "@/lib/public/marketplace";
import { fetchFacets, fetchListings } from "@/lib/public/marketplace-api";
import { signupHref } from "@/lib/public/visibility";
import type { SearchParamsLike } from "@/lib/public/filter-param-utils";

/**
 * ALIM TALEBİ DİZİNİ — süzgeç v4 (PROMPT 4, 2026-09-06): ürün dizinindeki
 * kabuk (URL durumu, geçiş, çekmece, bağlamsal facet, 7 yuvalı sayfalama)
 * burada da. URL şeması tek kaynak `lib/public/listing-filter-params.ts`
 * (Türkçe URL ↔ İngilizce API sınırı orada; sayfalar ham `searchParams` görmez).
 */
interface Props {
  type: PublicListingType;
  title: string;
  lead: string;
  searchParams: SearchParamsLike;
}

export async function ListingIndex({ title, lead, searchParams }: Props) {
  const state = parseListingFilters(searchParams);
  const params = toListingListParams(state);
  const basePath = MARKETPLACE_ROUTES.demands;
  const noun = MARKETPLACE_LABELS.demandOne;

  const [page, facets] = await Promise.all([
    fetchListings(params),
    fetchFacets({ q: params.q, category: params.category, city: params.city, scope: params.scope, closesWithin: params.closesWithin }),
  ]);
  const hasFilter = activeListingFilterCount(state) > 0 || !!state.q;

  return (
    <ListingFilterShell total={page.total} drawer={<ListingFilters facets={facets} idPrefix="m" />}>
      <PublicListPage
        title={title}
        lead={lead}
        search={{
          action: basePath,
          defaultValue: state.q,
          hidden: {
            kategori: state.category,
            sehir: state.cities.join(",") || undefined,
            kapsam: state.scope,
            sure: state.within,
            sirala: state.sort,
          },
          placeholder: "Talep başlığı, kalem veya kategori arayın",
        }}
        chips={[]}
        clearHref={basePath}
        chipsNode={<ListingActiveChips facets={facets} />}
        sidebar={<ListingFilters facets={facets} idPrefix="d" />}
        summary={
          <span className="flex flex-wrap items-center justify-between gap-3">
            <span className="flex items-center gap-3">
              <MobileFilterButton />
              <ResultCount noun={noun.toLocaleLowerCase("tr-TR")} />
            </span>
            <ListingSortBar />
          </span>
        }
      >
        <FilterResults>
          {page.items.length === 0 ? (
            <PublicEmptyState
              noun={hasFilter ? "Bu kriterlerle açık talep" : "Açık talep"}
              clearHref={hasFilter ? basePath : undefined}
              extra={{ label: "Talep aç", href: signupHref("talep") }}
            />
          ) : (
            <ResultGrid count={page.items.length} heading="Talep sonuçları">
              {page.items.map((l) => (
                <ListingTeaserCard key={l.number} listing={l} />
              ))}
            </ResultGrid>
          )}
        </FilterResults>
        <Pagination
          page={page.page}
          total={page.total}
          pageSize={page.pageSize}
          className="mt-10 border-t border-zinc-950/5 pt-6"
          hrefBuilder={(p) => `${basePath}${buildListingFilterQuery({ ...state, page: p })}`}
        />
      </PublicListPage>
    </ListingFilterShell>
  );
}
