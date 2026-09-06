import { isCompanyActivity } from "@rothern/shared";
import type { ProductListParams } from "./marketplace-api";

/**
 * ÜRÜN SÜZGEÇ URL ŞEMASI — TEK KAYNAK (2026-09-04, süzgeç v3).
 *
 * Türkçe URL ↔ İngilizce API sınırı burada; herkese açık `/urunler` (sunucu)
 * ve panel "Ürün Ara" (istemci) AYNI ayrıştırıcıyı okur, AYNI kurucuyu yazar.
 *
 *   ?q=&kategori=42000000&sehir=İstanbul,İzmir&faaliyet=MANUFACTURER,DISTRIBUTOR
 *   &dogrulanmis=1&fiyat=var|teklif&fiyatMin=&fiyatMax=&moqMax=&sirala=yeni|fiyat|fiyat-azalan
 *   &nitelik=anahtar:değer (tekrarlanır)&sayfa=2
 *
 * Kategori de sorguda: eskiden yalnız yolda (`/urunler/kategori/<kod>-<ad>`)
 * idi ve diğer süzgeçlerle birleşimi tutarsızdı. Yol sayfaları SEO girişi
 * olarak KALIR; etkileşim sorgu şemasına geçer.
 */
export interface ProductFilterState {
  q?: string;
  category?: string;
  cities: string[];
  activities: string[];
  verified: boolean;
  price?: "var" | "teklif";
  priceMin?: number;
  priceMax?: number;
  moqMax?: number;
  sort?: "yeni" | "fiyat" | "fiyat-azalan";
  attrs: string[];
  page: number;
}

import {
  getAllParams as getAll,
  getParam as get,
  listParam as list,
  numParam as num,
  type SearchParamsLike,
} from "./filter-param-utils";

export type { SearchParamsLike };

export function parseProductFilters(sp: SearchParamsLike, fixedCategory?: string): ProductFilterState {
  const cat = fixedCategory ?? get(sp, "kategori");
  const sort = get(sp, "sirala");
  const price = get(sp, "fiyat");
  const page = num(get(sp, "sayfa"));
  return {
    q: get(sp, "q")?.trim() || undefined,
    category: cat && /^\d{8}$/.test(cat) ? cat : undefined,
    cities: list(get(sp, "sehir") ?? get(sp, "il")),
    activities: list(get(sp, "faaliyet")).filter(isCompanyActivity),
    verified: get(sp, "dogrulanmis") === "1",
    price: price === "var" || price === "teklif" ? price : undefined,
    priceMin: num(get(sp, "fiyatMin")),
    priceMax: num(get(sp, "fiyatMax")),
    moqMax: num(get(sp, "moqMax")),
    sort: sort === "yeni" || sort === "fiyat" || sort === "fiyat-azalan" ? sort : undefined,
    attrs: getAll(sp, "nitelik").filter((a) => a.includes(":")).slice(0, 6),
    page: page && page > 1 ? page : 1,
  };
}

/** Durum → API parametreleri. */
export function toProductListParams(f: ProductFilterState): ProductListParams & { page?: number } {
  return {
    q: f.q,
    category: f.category,
    city: f.cities.length ? f.cities.join(",") : undefined,
    activity: f.activities.length ? f.activities.join(",") : undefined,
    verified: f.verified || undefined,
    price: f.price === "var" ? "has" : f.price === "teklif" ? "request" : undefined,
    priceMin: f.priceMin,
    priceMax: f.priceMax,
    moqMax: f.moqMax,
    sort: f.sort === "yeni" ? "newest" : f.sort === "fiyat" ? "price" : f.sort === "fiyat-azalan" ? "price_desc" : undefined,
    attr: f.attrs.length ? f.attrs : undefined,
    page: f.page > 1 ? f.page : undefined,
  };
}

/** Durum → URL sorgusu ("?..." ya da ""). Sayfa 1 ve boş alanlar yazılmaz. */
export function buildProductFilterQuery(f: ProductFilterState): string {
  const sp = new URLSearchParams();
  if (f.q) sp.set("q", f.q);
  if (f.category) sp.set("kategori", f.category);
  if (f.cities.length) sp.set("sehir", f.cities.join(","));
  if (f.activities.length) sp.set("faaliyet", f.activities.join(","));
  if (f.verified) sp.set("dogrulanmis", "1");
  if (f.price) sp.set("fiyat", f.price);
  if (f.priceMin != null) sp.set("fiyatMin", String(f.priceMin));
  if (f.priceMax != null) sp.set("fiyatMax", String(f.priceMax));
  if (f.moqMax != null) sp.set("moqMax", String(f.moqMax));
  if (f.sort) sp.set("sirala", f.sort);
  for (const a of f.attrs) sp.append("nitelik", a);
  if (f.page > 1) sp.set("sayfa", String(f.page));
  const s = sp.toString();
  return s ? `?${s}` : "";
}

/** Aktif süzgeç sayısı (arama, sıralama ve sayfa hariç) — "Filtrele (3)". */
export function activeFilterCount(f: ProductFilterState): number {
  return (
    (f.category ? 1 : 0) + f.cities.length + f.activities.length + (f.verified ? 1 : 0) + (f.price ? 1 : 0) +
    (f.priceMin != null || f.priceMax != null ? 1 : 0) + (f.moqMax != null ? 1 : 0) + f.attrs.length
  );
}

export const EMPTY_FILTERS: ProductFilterState = { cities: [], activities: [], verified: false, attrs: [], page: 1 };
