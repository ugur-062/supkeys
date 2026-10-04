import { getParam as get, listParam, pageParam, type SearchParamsLike } from "./filter-param-utils";
import type { ListParams } from "./marketplace-api";

/**
 * ALIM TALEBİ DİZİNİ URL ŞEMASI — TEK KAYNAK (PROMPT 4, 2026-09-06).
 *
 * `?q=&kategori=39000000&aliciUlke=TR,DE&ulke=DE
 *  &sure=3|7|30&sirala=yeni|kapanis&durum=hepsi&sayfa=2`
 *
 * `aliciUlke` = ALICININ ülkesi (talebin açıldığı ülke); `ulke` = teklif
 * verebilecek TEDARİKÇİNİN ülkesi (görünürlük) — iki ayrı soru, iki anahtar.
 * ALICI ŞEHRİ SÜZGECİ YOK (2026-10-04 sahip kararı: talepte konum = ülke):
 * eski `?sehir=` / `?il=` bağlantıları açılır ama parametre YOK SAYILIR
 * (süzülmemiş liste; kanonik zaten süzgeçsiz taban) ve bir sonraki süzgeç
 * değişikliğinde adresten düşer.
 * Türkçe URL ↔ İngilizce API sınırı burada; sayfalar ham `searchParams` görmez.
 */
export interface ListingFilterState {
  q?: string;
  category?: string;
  /** Alıcı ülkeleri (ISO alpha-2, büyük harf, tekrarsız) — `?aliciUlke=TR,DE`. */
  buyerCountries: string[];
  /** Görünürlük ülkesi (ISO alpha-2) — `?ulke=DE`. */
  country?: string;
  within?: "3" | "7" | "30";
  sort?: "yeni" | "kapanis";
  /** `hepsi` = kapanmışlar da (arşiv); varsayılan yalnız açık. */
  state?: "hepsi";
  page: number;
}

/**
 * API doğrulama SINIRLARI (`PublicListQueryDto`) — ayrıştırma bunlara kırpar
 * (ürün dizinindeki D-056 ile aynı kural; arayüz testi son tur webA-2).
 * Eskiden `?sayfa=201` ya da 120 karakteri aşan arama uçtan 400 alıyor ve
 * ziyaretçi "Alım talebi bulunamadı" görüyordu — oysa açık talepler var.
 */
export const LISTING_SEARCH_MAX_LENGTH = 120;
export const LISTING_PAGE_LIMIT = 200;

export const EMPTY_LISTING_FILTERS: ListingFilterState = { buyerCountries: [], page: 1 };

/** `?aliciUlke=` değeri → geçerli ISO kodları (büyük harf, tekrarsız, ≤10; bozuk parça düşer). */
export function buyerCountryParam(v?: string): string[] {
  return [...new Set(listParam(v).map((c) => c.toUpperCase()).filter((c) => /^[A-Z]{2}$/.test(c)))];
}

export function parseListingFilters(sp: SearchParamsLike): ListingFilterState {
  const cat = get(sp, "kategori");
  const country = get(sp, "ulke")?.toUpperCase();
  const within = get(sp, "sure");
  const sort = get(sp, "sirala");
  return {
    q: get(sp, "q")?.trim().slice(0, LISTING_SEARCH_MAX_LENGTH).trim() || undefined,
    category: cat && /^\d{8}$/.test(cat) ? cat : undefined,
    buyerCountries: buyerCountryParam(get(sp, "aliciUlke")),
    country: country && /^[A-Z]{2}$/.test(country) ? country : undefined,
    within: within === "3" || within === "7" || within === "30" ? within : undefined,
    sort: sort === "yeni" || sort === "kapanis" ? sort : undefined,
    state: get(sp, "durum") === "hepsi" ? "hepsi" : undefined,
    page: Math.min(pageParam(get(sp, "sayfa")), LISTING_PAGE_LIMIT),
  };
}

export function toListingListParams(f: ListingFilterState): ListParams {
  return {
    type: "ALIM",
    q: f.q,
    category: f.category,
    buyerCountry: f.buyerCountries.length ? f.buyerCountries.join(",") : undefined,
    country: f.country,
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
  if (f.buyerCountries.length) sp.set("aliciUlke", f.buyerCountries.join(","));
  if (f.country) sp.set("ulke", f.country);
  if (f.within) sp.set("sure", f.within);
  if (f.sort) sp.set("sirala", f.sort);
  if (f.state) sp.set("durum", f.state);
  if (f.page > 1) sp.set("sayfa", String(f.page));
  const s = sp.toString();
  return s ? `?${s}` : "";
}

/** Aktif süzgeç sayısı (arama, sıralama, durum ve sayfa hariç). */
export function activeListingFilterCount(f: ListingFilterState): number {
  return (f.category ? 1 : 0) + f.buyerCountries.length + (f.country ? 1 : 0) + (f.within ? 1 : 0);
}

export function clearListingFilters(f: ListingFilterState): ListingFilterState {
  return { ...EMPTY_LISTING_FILTERS, q: f.q, sort: f.sort, state: f.state };
}
