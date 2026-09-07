import { isCompanyActivity, isEmployeeBucketKey, isRadiusOption } from "@rothern/shared";
import type { ProductListParams } from "./marketplace-api";
import {
  getAllParams as getAll,
  getParam as get,
  listParam as list,
  numParam as num,
  type SearchParamsLike,
} from "./filter-param-utils";

/**
 * ÜRÜN SÜZGEÇ URL ŞEMASI — TEK KAYNAK (2026-09-04, süzgeç v3).
 *
 * Türkçe URL ↔ İngilizce API sınırı burada; herkese açık `/urunler` (sunucu)
 * ve panel ürün dizini (istemci) AYNI ayrıştırıcıyı okur, AYNI kurucuyu yazar.
 *
 *   ?q=&kategori=42000000&sehir=İstanbul,İzmir&faaliyet=MANUFACTURER,DISTRIBUTOR
 *   &dogrulanmis=1&fiyat=var|teklif&fiyatMin=&fiyatMax=&fiyatsizDahil=1&moqMax=
 *   &sertifika=ISO 9001,CE&calisan=10,50&sirala=yeni|fiyat|fiyat-azalan
 *   &nitelik=anahtar:değer (tekrarlanır)&adet=24|48|96&gorunum=liste&sayfa=2
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
  /** Aralık seçiliyken "teklif isteyin" ürünleri de tut. */
  priceUnpriced: boolean;
  moqMax?: number;
  /** Firma sertifikaları (serbest metin, facet'ten gelir). */
  certs: string[];
  /** Çalışan kovası ALT SINIRLARI (1 | 10 | 50 | 250). */
  employees: number[];
  /** "Yakınımda" merkezi (il adı ya da posta kodu) — `radius` ile ANLAMLI. */
  near?: string;
  radius?: number;
  /** "Hızlı yanıt veren" — firma profili grubunda. */
  fastReply: boolean;
  sort?: "yeni" | "fiyat" | "fiyat-azalan";
  attrs: string[];
  page: number;
  /** Sayfa başına kart. Varsayılan çağırandan gelir, URL'e YALNIZ değişince yazılır. */
  perPage?: PerPage;
  /**
   * Izgara (varsayılan) ↔ liste. GÖRÜNÜM tercihi, süzgeç DEĞİL: "Tümünü
   * temizle" onu korur ve aktif süzgeç sayısına girmez. URL'de olması
   * paylaşılan bağlantının aynı düzende açılmasını sağlar.
   */
  view?: "liste";
}

export type { SearchParamsLike };

/** "Sayfa başına" seçenekleri — üçü de bir ekranda okunabilir yoğunlukta. */
export const PER_PAGE_OPTIONS = [24, 48, 96] as const;
export type PerPage = (typeof PER_PAGE_OPTIONS)[number];
const isPerPage = (n?: number): n is PerPage => !!n && (PER_PAGE_OPTIONS as readonly number[]).includes(n);

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
    priceUnpriced: get(sp, "fiyatsizDahil") === "1",
    moqMax: num(get(sp, "moqMax")),
    certs: list(get(sp, "sertifika")),
    // Bilinmeyen kova anahtarı düşer — URL elle düzenlenmiş olabilir.
    employees: list(get(sp, "calisan")).map(Number).filter(isEmployeeBucketKey),
    // İkisi birlikte anlamlı: yalnız biri varsa süzgeç uygulanmaz (ve URL'e
    // de yazılmaz) — yarım bir kısıt listeyi sessizce boşaltırdı.
    near: get(sp, "yakin")?.trim() || undefined,
    radius: isRadiusOption(num(get(sp, "mesafe")) ?? 0) ? num(get(sp, "mesafe")) : undefined,
    fastReply: get(sp, "hizli") === "1",
    sort: sort === "yeni" || sort === "fiyat" || sort === "fiyat-azalan" ? sort : undefined,
    attrs: getAll(sp, "nitelik").filter((a) => a.includes(":")).slice(0, 6),
    page: page && page > 1 ? page : 1,
    perPage: isPerPage(num(get(sp, "adet"))) ? (num(get(sp, "adet")) as PerPage) : undefined,
    view: get(sp, "gorunum") === "liste" ? "liste" : undefined,
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
    priceUnpriced: f.priceUnpriced || undefined,
    moqMax: f.moqMax,
    cert: f.certs.length ? f.certs.join(",") : undefined,
    employees: f.employees.length ? f.employees.join(",") : undefined,
    fastReply: f.fastReply || undefined,
    near: f.near && f.radius ? f.near : undefined,
    radius: f.near && f.radius ? f.radius : undefined,
    sort: f.sort === "yeni" ? "newest" : f.sort === "fiyat" ? "price" : f.sort === "fiyat-azalan" ? "price_desc" : undefined,
    attr: f.attrs.length ? f.attrs : undefined,
    page: f.page > 1 ? f.page : undefined,
    pageSize: f.perPage,
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
  if (f.priceUnpriced) sp.set("fiyatsizDahil", "1");
  if (f.moqMax != null) sp.set("moqMax", String(f.moqMax));
  if (f.certs.length) sp.set("sertifika", f.certs.join(","));
  if (f.employees.length) sp.set("calisan", f.employees.join(","));
  if (f.fastReply) sp.set("hizli", "1");
  if (f.near && f.radius) {
    sp.set("yakin", f.near);
    sp.set("mesafe", String(f.radius));
  }
  if (f.sort) sp.set("sirala", f.sort);
  for (const a of f.attrs) sp.append("nitelik", a);
  if (f.perPage) sp.set("adet", String(f.perPage));
  if (f.view) sp.set("gorunum", f.view);
  if (f.page > 1) sp.set("sayfa", String(f.page));
  const s = sp.toString();
  return s ? `?${s}` : "";
}

/** Aktif süzgeç sayısı (arama, sıralama ve sayfa hariç) — "Filtrele (3)". */
export function activeFilterCount(f: ProductFilterState): number {
  return (
    (f.category ? 1 : 0) + f.cities.length + f.activities.length + (f.verified ? 1 : 0) + (f.fastReply ? 1 : 0) + (f.price ? 1 : 0) +
    (f.priceMin != null || f.priceMax != null ? 1 : 0) + (f.moqMax != null ? 1 : 0) + f.attrs.length +
    f.certs.length + f.employees.length + (f.near && f.radius ? 1 : 0)
  );
}

export const EMPTY_FILTERS: ProductFilterState = {
  cities: [],
  activities: [],
  verified: false,
  attrs: [],
  certs: [],
  employees: [],
  priceUnpriced: false,
  fastReply: false,
  page: 1,
};

/**
 * "Tümünü temizle" — süzgeçler gider, ARAMA ve GÖRÜNÜM tercihleri (sıralama,
 * sayfa başına) kalır. Kullanıcı süzgeci temizlerken "96'lık listeye dön"
 * demiyor; sıralama zaten çipte görünür durumda.
 */
export function clearProductFilters(f: ProductFilterState): ProductFilterState {
  return { ...EMPTY_FILTERS, q: f.q, sort: f.sort, perPage: f.perPage, view: f.view };
}
