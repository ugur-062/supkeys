import { getParam as get, listParam as list, pageParam, type SearchParamsLike } from "./filter-param-utils";
import type { PublicDirectoryParams } from "./marketplace-api";
import { isCompanyActivity } from "@rothern/shared";

/**
 * FİRMA DİZİNİ URL ŞEMASI — TEK KAYNAK (PROMPT 4, 2026-09-06).
 *
 * `?q=&sehir=a,b&faaliyet=A,B&kategori=39000000,23000000&dogrulanmis=1
 *  &urunlu=1&gold=1&sirala=ad|urun|yeni&sayfa=2`
 *
 * Eski `il=` (tek şehir) ve tekil `faaliyet=` okunmaya devam eder.
 */
export interface CompanyFilterState {
  q?: string;
  cities: string[];
  activities: string[];
  categories: string[];
  verified: boolean;
  hasProducts: boolean;
  gold: boolean;
  sort?: "ad" | "urun" | "yeni";
  page: number;
}

export const EMPTY_COMPANY_FILTERS: CompanyFilterState = {
  cities: [],
  activities: [],
  categories: [],
  verified: false,
  hasProducts: false,
  gold: false,
  page: 1,
};

export function parseCompanyFilters(sp: SearchParamsLike): CompanyFilterState {
  const sort = get(sp, "sirala");
  return {
    q: get(sp, "q")?.trim() || undefined,
    cities: list(get(sp, "sehir") ?? get(sp, "il")),
    activities: list(get(sp, "faaliyet")).filter(isCompanyActivity),
    categories: list(get(sp, "kategori")).filter((c) => /^\d{8}$/.test(c)),
    verified: get(sp, "dogrulanmis") === "1",
    hasProducts: get(sp, "urunlu") === "1",
    gold: get(sp, "gold") === "1",
    sort: sort === "ad" || sort === "urun" || sort === "yeni" ? sort : undefined,
    page: pageParam(get(sp, "sayfa")),
  };
}

export function toDirectoryParams(f: CompanyFilterState): PublicDirectoryParams {
  return {
    q: f.q,
    city: f.cities.length ? f.cities.join(",") : undefined,
    activity: f.activities.length ? f.activities.join(",") : undefined,
    category: f.categories.length ? f.categories.join(",") : undefined,
    verified: f.verified || undefined,
    hasProducts: f.hasProducts || undefined,
    gold: f.gold || undefined,
    sort: f.sort === "ad" ? "name" : f.sort === "urun" ? "products" : f.sort === "yeni" ? "newest" : undefined,
    page: f.page > 1 ? f.page : undefined,
  };
}

export function buildCompanyFilterQuery(f: CompanyFilterState): string {
  const sp = new URLSearchParams();
  if (f.q) sp.set("q", f.q);
  if (f.cities.length) sp.set("sehir", f.cities.join(","));
  if (f.activities.length) sp.set("faaliyet", f.activities.join(","));
  if (f.categories.length) sp.set("kategori", f.categories.join(","));
  if (f.verified) sp.set("dogrulanmis", "1");
  if (f.hasProducts) sp.set("urunlu", "1");
  if (f.gold) sp.set("gold", "1");
  if (f.sort) sp.set("sirala", f.sort);
  if (f.page > 1) sp.set("sayfa", String(f.page));
  const s = sp.toString();
  return s ? `?${s}` : "";
}

/** Aktif süzgeç sayısı (arama, sıralama ve sayfa hariç). */
export function activeCompanyFilterCount(f: CompanyFilterState): number {
  return (
    f.cities.length + f.activities.length + f.categories.length +
    (f.verified ? 1 : 0) + (f.hasProducts ? 1 : 0) + (f.gold ? 1 : 0)
  );
}

export function clearCompanyFilters(f: CompanyFilterState): CompanyFilterState {
  return { ...EMPTY_COMPANY_FILTERS, q: f.q, sort: f.sort };
}
