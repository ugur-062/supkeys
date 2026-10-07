import { cityListParam, getParam as get, listParam as list, pageParam, type SearchParamsLike } from "./filter-param-utils";
import type { PublicDirectoryParams } from "./marketplace-api";
import { isCompanyActivity } from "@rothern/shared";

/**
 * FİRMA DİZİNİ URL ŞEMASI — TEK KAYNAK (PROMPT 4, 2026-09-06).
 *
 * `?q=&sehir=a,b&faaliyet=A,B&kategori=39000000,23000000&dogrulanmis=1
 *  &urunlu=1&baglanti=bagli|yeni&sirala=ad|urun|yeni&sayfa=2`
 *
 * Eski `il=` (tek şehir) ve tekil `faaliyet=` okunmaya devam eder.
 * Eski `gold=1` süzgeci ücretsiz dönemde KALDIRILDI (2026-10-07): parametre
 * yok sayılır, paylaşılmış bağlantı süzgeçsiz dizini açar.
 *
 * `baglanti` YALNIZ panelde anlamlı (ziyaretçinin bağlantısı yoktur), ama
 * şema tek dosyada durur: iki kopya olsaydı panel "sehir" yazarken public
 * "il" okumaya devam eder, iki liste sessizce ayrışırdı.
 */
export interface CompanyFilterState {
  q?: string;
  cities: string[];
  /** Firma ülkesi (ISO) — `?ulke=DE` (2026-09-27). */
  countries: string[];
  activities: string[];
  categories: string[];
  verified: boolean;
  hasProducts: boolean;
  /** Panel: bağlı olduklarım | henüz bağlı olmadıklarım. */
  connection?: "bagli" | "yeni";
  sort?: "ad" | "urun" | "yeni";
  page: number;
}

export const EMPTY_COMPANY_FILTERS: CompanyFilterState = {
  cities: [],
  countries: [],
  activities: [],
  categories: [],
  verified: false,
  hasProducts: false,
  page: 1,
};

export function parseCompanyFilters(sp: SearchParamsLike): CompanyFilterState {
  const sort = get(sp, "sirala");
  const conn = get(sp, "baglanti");
  return {
    q: get(sp, "q")?.trim() || undefined,
    cities: cityListParam(get(sp, "sehir") ?? get(sp, "il")),
    countries: list(get(sp, "ulke")).map((c) => c.toUpperCase()).filter((c) => /^[A-Z]{2}$/.test(c)),
    activities: list(get(sp, "faaliyet")).filter(isCompanyActivity),
    categories: list(get(sp, "kategori")).filter((c) => /^\d{8}$/.test(c)),
    verified: get(sp, "dogrulanmis") === "1",
    hasProducts: get(sp, "urunlu") === "1",
    connection: conn === "bagli" || conn === "yeni" ? conn : undefined,
    sort: sort === "ad" || sort === "urun" || sort === "yeni" ? sort : undefined,
    page: pageParam(get(sp, "sayfa")),
  };
}

export function toDirectoryParams(f: CompanyFilterState): PublicDirectoryParams {
  return {
    q: f.q,
    city: f.cities.length ? f.cities.join(",") : undefined,
    country: f.countries.length ? f.countries.join(",") : undefined,
    activity: f.activities.length ? f.activities.join(",") : undefined,
    category: f.categories.length ? f.categories.join(",") : undefined,
    verified: f.verified || undefined,
    hasProducts: f.hasProducts || undefined,
    sort: f.sort === "ad" ? "name" : f.sort === "urun" ? "products" : f.sort === "yeni" ? "newest" : undefined,
    page: f.page > 1 ? f.page : undefined,
  };
}

/** Panel dizini — public parametrelere `connection` eklenir. */
export function toPanelDirectoryParams(f: CompanyFilterState) {
  return {
    ...toDirectoryParams(f),
    connection: f.connection === "bagli" ? ("connected" as const) : f.connection === "yeni" ? ("new" as const) : undefined,
  };
}

export function buildCompanyFilterQuery(f: CompanyFilterState): string {
  const sp = new URLSearchParams();
  if (f.q) sp.set("q", f.q);
  if (f.cities.length) sp.set("sehir", f.cities.join(","));
  if (f.countries.length) sp.set("ulke", f.countries.join(","));
  if (f.activities.length) sp.set("faaliyet", f.activities.join(","));
  if (f.categories.length) sp.set("kategori", f.categories.join(","));
  if (f.verified) sp.set("dogrulanmis", "1");
  if (f.hasProducts) sp.set("urunlu", "1");
  if (f.connection) sp.set("baglanti", f.connection);
  if (f.sort) sp.set("sirala", f.sort);
  if (f.page > 1) sp.set("sayfa", String(f.page));
  const s = sp.toString();
  return s ? `?${s}` : "";
}

/** Aktif süzgeç sayısı (arama, sıralama ve sayfa hariç). */
export function activeCompanyFilterCount(f: CompanyFilterState): number {
  return (
    f.cities.length + f.countries.length + f.activities.length + f.categories.length +
    (f.verified ? 1 : 0) + (f.hasProducts ? 1 : 0) + (f.connection ? 1 : 0)
  );
}

export function clearCompanyFilters(f: CompanyFilterState): CompanyFilterState {
  return { ...EMPTY_COMPANY_FILTERS, q: f.q, sort: f.sort };
}
