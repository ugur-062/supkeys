import { ListingCard } from "./listing-card";
import { FacetGroup } from "./facets";
import { Pagination } from "./pagination";
import { PublicEmptyState } from "./public-empty-state";
import { PublicListPage, ResultGrid } from "./public-list-page";
import {
  MARKETPLACE_LABELS,
  MARKETPLACE_ROUTES,
  type PublicListingType,
} from "@/lib/public/marketplace";
import {
  fetchFacets,
  fetchListings,
  type ListParams,
} from "@/lib/public/marketplace-api";

/**
 * TÜRKÇE URL ↔ İNGİLİZCE API sınırı.
 *
 * Ziyaretçinin gördüğü adres Türkçe (`?kategori=31000000&il=İstanbul&sayfa=2`),
 * API sözleşmesi İngilizce. Çeviri TEK yerde, burada; sayfalar ham
 * `searchParams` görmez. Bilinmeyen parametre sessizce düşer — ziyaretçinin
 * uydurduğu bir anahtar sorguya sızmasın.
 */
export interface MarketplaceSearchParams {
  q?: string;
  kategori?: string;
  il?: string;
  sayfa?: string;
  durum?: string;
  /** `yurtici` | `uluslararasi` */
  kapsam?: string;
}

const SCOPE: Record<string, ListParams["scope"]> = {
  yurtici: "domestic",
  uluslararasi: "international",
};
const SCOPE_LABEL = { domestic: "Yurtiçi", international: "Uluslararası" } as const;
const SCOPE_PARAM = { domestic: "yurtici", international: "uluslararasi" } as const;

export function toListParams(
  sp: MarketplaceSearchParams,
  type: PublicListingType,
): ListParams {
  const page = Number(sp.sayfa);
  return {
    type,
    q: sp.q?.trim() || undefined,
    category: /^\d{8}$/.test(sp.kategori ?? "") ? sp.kategori : undefined,
    city: sp.il?.trim() || undefined,
    state: sp.durum === "hepsi" ? "all" : undefined,
    scope: sp.kapsam ? SCOPE[sp.kapsam] : undefined,
    page: Number.isFinite(page) && page > 1 ? Math.trunc(page) : undefined,
  };
}

interface Props {
  type: PublicListingType;
  title: string;
  lead: string;
  searchParams: MarketplaceSearchParams;
}

export async function ListingIndex({ type, title, lead, searchParams }: Props) {
  const params = toListParams(searchParams, type);
  const basePath =
    type === "ALIM" ? MARKETPLACE_ROUTES.demands : MARKETPLACE_ROUTES.offers;
  const noun = type === "ALIM" ? MARKETPLACE_LABELS.demandOne : MARKETPLACE_LABELS.offerOne;

  const [page, facets] = await Promise.all([
    fetchListings(params),
    fetchFacets(),
  ]);

  const activeCategory = params.category;
  const activeCity = params.city;
  const activeScope = params.scope;
  const hasFilter = !!(params.q || activeCategory || activeCity || activeScope);

  /** Süzgeç bağlantısı — mevcut süzgeçleri korur, sayfayı 1'e döndürür. */
  const filterHref = (patch: Partial<MarketplaceSearchParams>) => {
    const next: Record<string, string | undefined> = {
      q: searchParams.q,
      kategori: searchParams.kategori,
      il: searchParams.il,
      durum: searchParams.durum,
      kapsam: searchParams.kapsam,
      ...patch,
    };
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) if (v) sp.set(k, v);
    const s = sp.toString();
    return s ? `${basePath}?${s}` : basePath;
  };
  const toggle = <K extends keyof MarketplaceSearchParams>(key: K, value: string, active: boolean) =>
    filterHref({ [key]: active ? undefined : value } as Partial<MarketplaceSearchParams>);

  const chips = [
    ...(params.q ? [{ key: "q", label: `"${params.q}"`, href: filterHref({ q: undefined }) }] : []),
    ...(activeCategory
      ? [{
          key: "kategori",
          label: facets.categories.find((c) => c.id === activeCategory)?.name ?? activeCategory,
          href: filterHref({ kategori: undefined }),
        }]
      : []),
    ...(activeCity ? [{ key: "il", label: activeCity, href: filterHref({ il: undefined }) }] : []),
    ...(activeScope
      ? [{ key: "kapsam", label: SCOPE_LABEL[activeScope], href: filterHref({ kapsam: undefined }) }]
      : []),
  ];

  return (
    <PublicListPage
      title={title}
      lead={lead}
      search={{
        action: basePath,
        defaultValue: searchParams.q,
        hidden: { kategori: searchParams.kategori, il: searchParams.il, kapsam: searchParams.kapsam },
      }}
      chips={chips}
      clearHref={basePath}
      summary={page.total > 0 ? `${page.total.toLocaleString("tr-TR")} kayıt` : undefined}
      sidebar={
        <>
          <FacetGroup
            heading="Kategori"
            items={facets.categories.slice(0, 12).map((c) => ({
              key: c.id,
              label: c.name,
              count: c.count,
              href: toggle("kategori", c.id, activeCategory === c.id),
              active: activeCategory === c.id,
            }))}
          />
          <FacetGroup
            heading="Şehir"
            items={facets.cities.slice(0, 12).map((c) => ({
              key: c.city,
              label: c.city,
              count: c.count,
              href: toggle("il", c.city, activeCity === c.city),
              active: activeCity === c.city,
            }))}
          />
          <FacetGroup
            heading="Kapsam"
            items={facets.scopes.map((s) => ({
              key: s.scope,
              label: SCOPE_LABEL[s.scope],
              count: s.count,
              href: toggle("kapsam", SCOPE_PARAM[s.scope], activeScope === s.scope),
              active: activeScope === s.scope,
            }))}
          />
        </>
      }
    >
      {page.items.length === 0 ? (
        <PublicEmptyState noun={noun} clearHref={hasFilter ? basePath : undefined} />
      ) : (
        <ResultGrid count={page.items.length}>
          {page.items.map((l) => (
            <ListingCard key={l.number} listing={l} />
          ))}
        </ResultGrid>
      )}
      <Pagination
        page={page.page}
        total={page.total}
        pageSize={page.pageSize}
        basePath={basePath}
        params={{
          q: searchParams.q,
          kategori: searchParams.kategori,
          il: searchParams.il,
          durum: searchParams.durum,
          kapsam: searchParams.kapsam,
        }}
      />
    </PublicListPage>
  );
}
