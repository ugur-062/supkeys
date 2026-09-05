/**
 * AÇIK TALEP SÜZGEÇ URL ŞEMASI — TEK KAYNAK (2026-09-05).
 *
 * Satış anasayfasındaki "Açık Talepler" listesi durumunu URL'de taşır
 * (ürün süzgeciyle aynı ilke: `lib/public/product-filter-params.ts`).
 * Hero kutusu `?q=`, süzgeç kenarı diğer anahtarları yazar; liste hepsini
 * buradan okur. Sayfa yer imlenebilir, geri tuşu süzgeci geri alır.
 *
 *   ?q=&durum=aktif|gecmis|tumu&uygunluk=davet,baglanti,kategori,teklif
 *   &kategori=39000000,23000000 (SEGMENT kodları) &kapsam=yurtici|uluslararasi
 *   &kapanis=3|7|30 &alici=<id>,<id> &sehir=a,b &para=TRY,USD &usul=teklif|pazarlik
 *   &donem=7|30|90 &sirala=yakin|uzak|yeni &sayfa=2
 *
 * Kategori SEGMENT düzeyinde: satır en çok 2 kod taşır ve sayaçlar segmentte
 * anlamlı; öneri/çipten gelen tam kod (L3+) segmentine indirgenir.
 */
export type RequestStatusFilter = "aktif" | "gecmis" | "tumu";
export type RequestFit = "davet" | "baglanti" | "kategori" | "teklif";
export type RequestScope = "yurtici" | "uluslararasi";
export type RequestFormat = "teklif" | "pazarlik";
export type RequestSort = "yakin" | "uzak" | "yeni";
export type ClosingWindow = 3 | 7 | 30;
export type PeriodWindow = 7 | 30 | 90;

export const CLOSING_WINDOWS: readonly ClosingWindow[] = [3, 7, 30];
export const PERIOD_WINDOWS: readonly PeriodWindow[] = [7, 30, 90];
export const FIT_OPTIONS: readonly { key: RequestFit; label: string }[] = [
  { key: "davet", label: "Davet edildim" },
  { key: "baglanti", label: "Bağlantılı alıcı" },
  { key: "kategori", label: "Kategorime uygun" },
  { key: "teklif", label: "Teklif verdiklerim" },
];
export const STATUS_OPTIONS: readonly { key: RequestStatusFilter; label: string }[] = [
  { key: "aktif", label: "Aktif" },
  { key: "gecmis", label: "Geçmiş" },
  { key: "tumu", label: "Tümü" },
];
export const SORT_OPTIONS: readonly { key: RequestSort | undefined; label: string }[] = [
  { key: undefined, label: "Size uygun" },
  { key: "yakin", label: "Yakın biten" },
  { key: "uzak", label: "Uzak biten" },
  { key: "yeni", label: "En yeni" },
];

export interface RequestFilterState {
  q?: string;
  /** Varsayılan `aktif` — geçmiş (katıldığım kapanmış) talepler istenince. */
  status: RequestStatusFilter;
  /** Grup içi VEYA: "davetli ya da bağlantılı". */
  fit: RequestFit[];
  /** Segment kodları (`XX000000`). */
  categories: string[];
  scope?: RequestScope;
  /** N gün içinde kapanan (yalnız açık talepler). */
  closing?: ClosingWindow;
  /** Alıcı firma id'leri (maskeli satırlar sahipsiz — listede yok). */
  buyers: string[];
  cities: string[];
  currencies: string[];
  format?: RequestFormat;
  /** Son N günde yayımlanan. */
  period?: PeriodWindow;
  /** Yok = "Size uygun" (ilgi merdiveni + skor). */
  sort?: RequestSort;
  page: number;
}

export type SearchParamsLike = Record<string, string | string[] | undefined> | URLSearchParams;

function get(sp: SearchParamsLike, k: string): string | undefined {
  if (sp instanceof URLSearchParams) return sp.get(k) ?? undefined;
  const v = sp[k];
  return Array.isArray(v) ? v[0] : v;
}
const list = (v: string | undefined, max = 10) =>
  (v ?? "").split(",").map((x) => x.trim()).filter(Boolean).slice(0, max);
const oneOf = <T extends string>(v: string | undefined, allowed: readonly T[]): T | undefined =>
  allowed.includes(v as T) ? (v as T) : undefined;
const oneOfNum = <T extends number>(v: string | undefined, allowed: readonly T[]): T | undefined => {
  const n = Number(v);
  return allowed.includes(n as T) ? (n as T) : undefined;
};

/** 8 haneli kod → segment kodu (`39121501` → `39000000`). */
export const segmentOf = (code: string): string => `${code.slice(0, 2)}000000`;

export function parseRequestFilters(sp: SearchParamsLike): RequestFilterState {
  const page = Number(get(sp, "sayfa"));
  const fits = list(get(sp, "uygunluk")).filter((x): x is RequestFit =>
    FIT_OPTIONS.some((o) => o.key === x),
  );
  return {
    q: get(sp, "q")?.trim() || undefined,
    status: oneOf(get(sp, "durum"), ["aktif", "gecmis", "tumu"] as const) ?? "aktif",
    fit: [...new Set(fits)],
    categories: [
      ...new Set(list(get(sp, "kategori")).filter((c) => /^\d{8}$/.test(c)).map(segmentOf)),
    ],
    scope: oneOf(get(sp, "kapsam"), ["yurtici", "uluslararasi"] as const),
    closing: oneOfNum(get(sp, "kapanis"), CLOSING_WINDOWS),
    buyers: list(get(sp, "alici")),
    cities: list(get(sp, "sehir")),
    currencies: list(get(sp, "para")).map((c) => c.toUpperCase()),
    format: oneOf(get(sp, "usul"), ["teklif", "pazarlik"] as const),
    period: oneOfNum(get(sp, "donem"), PERIOD_WINDOWS),
    sort: oneOf(get(sp, "sirala"), ["yakin", "uzak", "yeni"] as const),
    page: Number.isFinite(page) && page > 1 ? Math.trunc(page) : 1,
  };
}

/** Durum → URL sorgusu ("?..." ya da ""). Varsayılanlar ve boş alanlar yazılmaz. */
export function buildRequestFilterQuery(f: RequestFilterState): string {
  const sp = new URLSearchParams();
  if (f.q) sp.set("q", f.q);
  if (f.status !== "aktif") sp.set("durum", f.status);
  if (f.fit.length) sp.set("uygunluk", f.fit.join(","));
  if (f.categories.length) sp.set("kategori", f.categories.join(","));
  if (f.scope) sp.set("kapsam", f.scope);
  if (f.closing) sp.set("kapanis", String(f.closing));
  if (f.buyers.length) sp.set("alici", f.buyers.join(","));
  if (f.cities.length) sp.set("sehir", f.cities.join(","));
  if (f.currencies.length) sp.set("para", f.currencies.join(","));
  if (f.format) sp.set("usul", f.format);
  if (f.period) sp.set("donem", String(f.period));
  if (f.sort) sp.set("sirala", f.sort);
  if (f.page > 1) sp.set("sayfa", String(f.page));
  const s = sp.toString();
  return s ? `?${s}` : "";
}

/** Aktif süzgeç sayısı — arama, sıralama ve sayfa HARİÇ ("Filtrele (3)"). */
export function activeRequestFilterCount(f: RequestFilterState): number {
  return (
    (f.status !== "aktif" ? 1 : 0) +
    f.fit.length +
    f.categories.length +
    (f.scope ? 1 : 0) +
    (f.closing ? 1 : 0) +
    f.buyers.length +
    f.cities.length +
    f.currencies.length +
    (f.format ? 1 : 0) +
    (f.period ? 1 : 0)
  );
}

export const EMPTY_REQUEST_FILTERS: RequestFilterState = {
  status: "aktif",
  fit: [],
  categories: [],
  buyers: [],
  cities: [],
  currencies: [],
  page: 1,
};

/**
 * "Tümünü temizle": arama DAHİL sıfırlanır (arama burada bir çip — kutusu
 * hero'da, listeden uzakta), yalnız sıralama korunur.
 */
export function clearRequestFilters(f: RequestFilterState): RequestFilterState {
  return { ...EMPTY_REQUEST_FILTERS, sort: f.sort };
}
