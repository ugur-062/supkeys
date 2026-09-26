import { getTranslations } from "next-intl/server";
import { ListingFilterShell } from "./list-filter-shells";
import { FilterResults, MobileFilterButton, ResultCount } from "./filter-shell";
import { ListingActiveChips, ListingFilters, ListingSortBar } from "./listing-filters";
import { ListingTeaserRow } from "./listing-teaser-row";
import { PublicEmptyState } from "./public-empty-state";
import { PublicListPage, ResultGrid } from "./public-list-page";
import { PublicSearchTabs } from "./public-search-tabs";
import { crossCounts } from "@/lib/public/cross-counts";
import { Pagination } from "@/components/ui/pagination";
import {
  activeListingFilterCount,
  buildListingFilterQuery,
  parseListingFilters,
  toListingListParams,
} from "@/lib/public/listing-filter-params";
import { JsonLd } from "@/components/seo/json-ld";
import { graph, itemListNode } from "@/lib/seo/jsonld";
import { MARKETPLACE_ROUTES, listingHref, type PublicListingType } from "@/lib/public/marketplace";
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
  const t = await getTranslations("web.marketplace.index");
  const tl = await getTranslations("web.marketplace.labels");
  const state = parseListingFilters(searchParams);
  const params = toListingListParams(state);
  const basePath = MARKETPLACE_ROUTES.demands;
  const noun = tl("demandOne");

  const [page, facets, otherCounts] = await Promise.all([
    fetchListings(params),
    fetchFacets({ q: params.q, category: params.category, city: params.city, country: params.country, closesWithin: params.closesWithin }),
    // Sekme rozetleri: aynı sorgunun ÖTEKİ yüzeylerdeki toplamı
    // (yalnız arama varken istek atılır).
    crossCounts(state.q, "listings"),
  ]);
  const hasFilter = activeListingFilterCount(state) > 0 || !!state.q;

  /* ITEMLIST — liste sayfasının ne listelediğini söyler; başlıklar zaten
     herkese açık (sahip kimliği DEĞİL). Sıra numarası sayfalamayı yansıtır. */
  const listLd = graph([
    itemListNode({
      name: title,
      path: basePath,
      totalItems: page.total,
      startPosition: (page.page - 1) * page.pageSize + 1,
      items: page.items.map((l) => ({ name: l.title, path: listingHref(l) })),
    }),
  ]);

  return (
    <>
    <JsonLd data={listLd} />
    <ListingFilterShell total={page.total} drawer={<ListingFilters facets={facets} idPrefix="m" />}>
      <PublicListPage
          tabs={
            <PublicSearchTabs active="listings" q={state.q} counts={{ ...otherCounts, listings: page.total }} />
          }
        title={title}
        lead={lead}
        search={{
          action: basePath,
          defaultValue: state.q,
          hidden: {
            kategori: state.category,
            sehir: state.cities.join(",") || undefined,
            ulke: state.country,
            sure: state.within,
            sirala: state.sort,
          },
          placeholder: t("listingPlaceholder"),
        }}
        chips={[]}
        clearHref={basePath}
        chipsNode={<ListingActiveChips facets={facets} />}
        sidebar={<ListingFilters facets={facets} idPrefix="d" />}
        summary={
          <span className="flex flex-wrap items-center justify-between gap-3">
            <span className="flex items-center gap-3">
              <MobileFilterButton />
              <ResultCount kind="buyingRequest" noun={noun.toLocaleLowerCase("tr-TR")} />
            </span>
            <ListingSortBar />
          </span>
        }
      >
        <FilterResults>
          {/* SATIR listesi, ızgara DEĞİL (2026-09-13, kullanıcı kararı): alım
              talebi görsel taşımaz, kategori fotoğrafı basmak "bu ürünün
              fotoğrafı" yanılgısı üretiyordu. Anasayfayla ve satış panelindeki
              Açık Talepler'le AYNI satır (`ListingTeaserRow` →
              `ListingCard variant="row"`, kind "talep" → asla görsel). */}
          {page.items.length === 0 ? (
            <PublicEmptyState
              noun={hasFilter ? t("listingEmptyFiltered") : t("listingEmpty")}
              clearHref={hasFilter ? basePath : undefined}
              extra={{ label: t("openRequest"), href: signupHref("talep") }}
            />
          ) : (
            <ResultGrid count={page.items.length} heading={t("listingResults")} layout="list">
              {page.items.map((l) => (
                <ListingTeaserRow key={l.number} listing={l} />
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
    </>
  );
}
