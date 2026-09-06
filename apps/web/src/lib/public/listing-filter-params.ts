import { getParam as get, listParam as list, pageParam, type SearchParamsLike } from "./filter-param-utils";
import type { ListParams } from "./marketplace-api";

/**
 * ALIM TALEBİ DİZİNİ URL ŞEMASI — TEK KAYNAK (PROMPT 4, 2026-09-06).
 *
 * `?q=&kategori=39000000&sehir=İstanbul,İzmir&kapsam=yurtici|uluslararasi
 *  &sure=3|7|30&sirala=yeni|kapanis&durum=hepsi&sayfa=2`
 *
 * Eski `il=` parametresi okunmaya devam eder (paylaşılmış bağlantılar).
 * Türkçe URL ↔ İngilizce API sınırı burada; sayfalar ham `searchParams` görmez.
 */
export interface ListingFilterState {
  q?: string;
  category?: string;
  cities: string[];
  scope?: "yurtici" | "uluslararasi";
  within?: "3" | "7" | "30";
  sort?: "yeni" | "kapanis";
  /** `hepsi` = kapanmışlar da (arşiv); varsayılan yalnız açık. */
  state?: "hepsi";
  page: number;
}

export const EMPTY_LISTING_FILTERS: ListingFilterState = { cities: [], page: 1 };

export function parseListingFilters(sp: SearchParamsLike): ListingFilterState {
  const cat = get(sp, "kategori");
  const scope = get(sp, "kapsam");
  const within = get(sp, "sure");
  const sort = get(sp, "sirala");
  return {
    q: get(sp, "q")?.trim() || undefined,
    category: cat && /^\d{8}$/.test(cat) ? cat : undefined,
    cities: list(get(sp, "sehir") ?? get(sp, "il")),
    scope: scope === "yurtici" || scope === "uluslararasi" ? scope : undefined,
    within: within === "3" || within === "7" || within === "30" ? within : undefined,
    sort: sort === "yeni" || sort === "kapanis" ? sort : undefined,
    state: get(sp, "durum") === "hepsi" ? "hepsi" : undefined,
    page: pageParam(get(sp, "sayfa")),
  };
}

export function toListingListParams(f: ListingFilterState): ListParams {
  return {
    type: "ALIM",
    q: f.q,
    category: f.category,
    city: f.cities.length ? f.cities.join(",") : undefined,
    scope: f.scope === "yurtici" ? "domestic" : f.scope === "uluslararasi" ? "international" : undefined,
    closesWithin: f.within,
    sort: f.sort === "kapanis" ? "closing" : f.sort === "yeni" ? "newest" : undefined,
    state: f.state === "hepsi" ? "all" : undefined,
    page: f.page > 1 ? f.page : undefined,
  };
}

/** Durum → URL sorgusu ("?..." ya da ""). Sayfa 1 ve boş alanlar yazılmaz. */
export function buildListingFilterQuery(f: ListingFilterState): string {
  const sp = new URLSearchParams();
  if (f.q) sp.set("q", f.q);
  if (f.category) sp.set("kategori", f.category);
  if (f.cities.length) sp.set("sehir", f.cities.join(","));
  if (f.scope) sp.set("kapsam", f.scope);
  if (f.within) sp.set("sure", f.within);
  if (f.sort) sp.set("sirala", f.sort);
  if (f.state) sp.set("durum", f.state);
  if (f.page > 1) sp.set("sayfa", String(f.page));
  const s = sp.toString();
  return s ? `?${s}` : "";
}

/** Aktif süzgeç sayısı (arama, sıralama, durum ve sayfa hariç). */
export function activeListingFilterCount(f: ListingFilterState): number {
  return (f.category ? 1 : 0) + f.cities.length + (f.scope ? 1 : 0) + (f.within ? 1 : 0);
}

export function clearListingFilters(f: ListingFilterState): ListingFilterState {
  return { ...EMPTY_LISTING_FILTERS, q: f.q, sort: f.sort, state: f.state };
}
