import { resolveApiBaseUrl } from "@/lib/resolve-api-url";
import type { PublicListingType } from "./marketplace";

/**
 * Pazar yeri veri katmanı — SUNUCU tarafında çalışır.
 *
 * Bu uçlar auth GEREKTİRMEZ; çerez taşımıyoruz ve taşımamalıyız (çerez
 * taşınsaydı yanıt kullanıcıya özel olurdu ve `next.revalidate` ile
 * paylaşılan önbelleğe yazmak kişisel veriyi başkasına servis ederdi).
 *
 * Hata YUTULUR ve boş sonuç döner: pazar yeri sayfası API düştüğünde 500
 * vermek yerine "şu an ilan yok" göstermeli — SEO tarafında 500 gören
 * tarayıcı sayfayı indeksten düşürür, boş ama 200 dönen sayfa düşürmez.
 * Sunucu günlüğüne yazılır ki sessiz kalmasın.
 */

/**
 * İlan sahibinin ANONİM tarifi — ad/slug/logo YOK.
 *
 * Bir alım talebinde "kim alıyor" doğrudan rekabet istihbaratıdır; panelin
 * kendi maskeli önizlemesi de STANDART üyeye sahip adını göstermiyor, anonim
 * ziyaretçi ondan çoğunu göremez. Firma adı yalnız opt-in `/firma/<slug>`
 * profilinde ve firma dizininde görünür. Backend bu alanları zaten
 * DÖNDÜRMÜYOR (`PUBLIC_LISTING_SELECT`), tip de onu yansıtıyor.
 */
export interface PublicCompanyRef {
  city: string | null;
  country: string | null;
  industry: string | null;
  activities: string[];
}

export interface PublicCategoryRef {
  id: string;
  name: string;
  level: number;
}

export interface PublicListingCard {
  number: string;
  type: PublicListingType;
  title: string;
  status: string;
  /**
   * Kart/OG görseli. Sahibi seçmediyse ilk kalemin ilk görselinden TÜRETİLİR
   * (backend); o da yoksa `null` ve kategori görseline düşülür.
   */
  coverImageUrl: string | null;
  closesAt: string | null;
  publishedAt: string | null;
  primaryCurrency: string;
  isInternational: boolean;
  itemCount: number;
  excerpt: string | null;
  buyNowPrice: string | null;
  company: PublicCompanyRef;
  categories: PublicCategoryRef[];
}

export interface PublicListingItem {
  lineNo: number;
  images: string[];
  name: string;
  description: string | null;
  quantity: string;
  unit: string;
  unitCode: string | null;
  brand: string | null;
  mpn: string | null;
  alternativeAllowed: boolean;
  specification: string | null;
  warrantyMonths: number | null;
  hsCode: string | null;
  requiredByDate: string | null;
  buyNowUnitPrice: string | null;
}

export interface PublicListingDetail extends Omit<PublicListingCard, "excerpt"> {
  description: string | null;
  format: string | null;
  priceScope: string | null;
  allowedCurrencies: string[];
  targetCountries: string[];
  categoryIds: string[];
  keywords: string[];
  requireAllItems: boolean;
  requireBidDocument: boolean;
  requireGuaranteeLetter: boolean;
  isSealedBid: boolean;
  isLogistics: boolean;
  deliveryTerm: string | null;
  paymentCategory: string;
  paymentTiming: string;
  advancePercent: number | null;
  paymentDays: number | null;
  lcType: string | null;
  lcConfirmed: boolean;
  updatedAt: string;
  indexable: boolean;
  items: PublicListingItem[];
}

export interface PublicListPage {
  items: PublicListingCard[];
  total: number;
  page: number;
  pageSize: number;
}

export interface PublicFacets {
  categories: (PublicCategoryRef & { count: number })[];
  cities: { city: string; count: number }[];
  types: { type: string; count: number }[];
  truncated: boolean;
}

export interface PublicSitemapRow {
  number: string;
  title: string;
  type: PublicListingType;
  updatedAt: string;
}

/** Liste/facet için kısa; ilan detayında biraz daha uzun (aşağıda geçilir). */
const DEFAULT_REVALIDATE = 60;

async function getJson<T>(
  path: string,
  fallback: T,
  revalidate = DEFAULT_REVALIDATE,
): Promise<T> {
  const base = resolveApiBaseUrl();
  if (!base) return fallback;
  try {
    const res = await fetch(`${base}${path}`, {
      next: { revalidate },
      headers: { accept: "application/json" },
    });
    if (!res.ok) {
      if (res.status !== 404) {
        console.error(`[pazar-yeri] ${path} → HTTP ${res.status}`);
      }
      return fallback;
    }
    return (await res.json()) as T;
  } catch (err) {
    console.error(`[pazar-yeri] ${path} çağrısı başarısız`, err);
    return fallback;
  }
}

const EMPTY_PAGE: PublicListPage = {
  items: [],
  total: 0,
  page: 1,
  pageSize: 24,
};

export interface ListParams {
  type?: PublicListingType;
  q?: string;
  category?: string;
  city?: string;
  state?: "open" | "all";
  page?: number;
}

function toQuery(params: ListParams): string {
  const sp = new URLSearchParams();
  if (params.type) sp.set("type", params.type);
  if (params.q) sp.set("q", params.q);
  if (params.category) sp.set("category", params.category);
  if (params.city) sp.set("city", params.city);
  if (params.state) sp.set("state", params.state);
  if (params.page && params.page > 1) sp.set("page", String(params.page));
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export function fetchListings(params: ListParams = {}): Promise<PublicListPage> {
  return getJson(`/public/listings${toQuery(params)}`, EMPTY_PAGE);
}

/**
 * Tekil ilan. `null` = yok/erişilemez → sayfa `notFound()` çağırır.
 * Burada fallback ayrımı önemli: liste boş dönebilir ama detay sayfası
 * "bulunamadı"yı 404 olarak vermeli, boş bir sayfa 200 olarak değil.
 */
export async function fetchListing(
  number: string,
): Promise<PublicListingDetail | null> {
  const base = resolveApiBaseUrl();
  if (!base) return null;
  try {
    const res = await fetch(
      `${base}/public/listings/${encodeURIComponent(number)}`,
      { next: { revalidate: 120 }, headers: { accept: "application/json" } },
    );
    if (!res.ok) return null;
    return (await res.json()) as PublicListingDetail;
  } catch (err) {
    console.error(`[pazar-yeri] ilan ${number} çağrısı başarısız`, err);
    return null;
  }
}

const EMPTY_FACETS: PublicFacets = {
  categories: [],
  cities: [],
  types: [],
  truncated: false,
};

export function fetchFacets(): Promise<PublicFacets> {
  return getJson("/public/listings/facets", EMPTY_FACETS, 300);
}

export function fetchListingSitemap(): Promise<PublicSitemapRow[]> {
  return getJson<PublicSitemapRow[]>("/public/listings/sitemap", [], 900);
}

/* ------------------------------------------------------------------ */
/* Firma dizini                                                        */
/* ------------------------------------------------------------------ */

export interface PublicDirectoryCompany {
  name: string;
  slug: string | null;
  city: string | null;
  country: string | null;
  industry: string | null;
  activities: string[];
  logoUrl: string | null;
  aboutText: string | null;
  services: string[];
  foundedYear: number | null;
  updatedAt: string;
}

export interface PublicDirectoryPage {
  items: PublicDirectoryCompany[];
  total: number;
  page: number;
  pageSize: number;
}

export interface PublicDirectoryFacets {
  cities: { city: string; count: number }[];
  activities: { activity: string; count: number }[];
}

export interface DirectoryParams {
  q?: string;
  city?: string;
  category?: string;
  activity?: string;
  page?: number;
}

/**
 * Firma dizini — GİRİŞ GEREKTİRİR. Diğer pazar yeri çağrılarından üç farkı
 * var ve üçü de aynı sebepten:
 *
 *  · çerez TAŞINIR (`cookie` başlığı elle iletilir; sunucu bileşeninde
 *    tarayıcının çerezi kendiliğinden gitmez),
 *  · `cache: "no-store"` — yanıt oturuma bağlı; `next.revalidate` ile
 *    paylaşılan veri önbelleğine yazmak onu BAŞKA ziyaretçiye servis ederdi,
 *  · 401 hata değil BEKLENEN durum → `null` döner, sayfa "kaydolun" gösterir.
 */
export type DirectoryResult =
  | { authenticated: false }
  | { authenticated: true; page: PublicDirectoryPage; facets: PublicDirectoryFacets };

async function getAuthedJson<T>(
  path: string,
  cookie: string,
): Promise<T | null> {
  const base = resolveApiBaseUrl();
  if (!base) return null;
  try {
    const res = await fetch(`${base}${path}`, {
      cache: "no-store",
      headers: { accept: "application/json", cookie },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch (err) {
    console.error(`[dizin] ${path} çağrısı başarısız`, err);
    return null;
  }
}

export async function fetchDirectory(
  cookie: string,
  params: DirectoryParams = {},
): Promise<DirectoryResult> {
  const sp = new URLSearchParams();
  if (params.q) sp.set("q", params.q);
  if (params.city) sp.set("city", params.city);
  if (params.category) sp.set("category", params.category);
  if (params.activity) sp.set("activity", params.activity);
  if (params.page && params.page > 1) sp.set("page", String(params.page));
  const qs = sp.toString();

  const [page, facets] = await Promise.all([
    getAuthedJson<PublicDirectoryPage>(
      `/company/directory${qs ? `?${qs}` : ""}`,
      cookie,
    ),
    getAuthedJson<PublicDirectoryFacets>("/company/directory/facets", cookie),
  ]);
  // Sayfa gelmediyse kapı kapalı sayılır. Kapıyı çerezin VARLIĞINA değil
  // API'nin yanıtına bağlıyoruz: sahte bir çerez basmak yetmesin.
  if (!page) return { authenticated: false };
  return {
    authenticated: true,
    page,
    facets: facets ?? { cities: [], activities: [] },
  };
}

/* ------------------------------------------------------------------ */
/* Ürün vitrini (Faz 2)                                                */
/* ------------------------------------------------------------------ */

export interface PriceTier {
  minQty: number;
  unitPrice: number;
}

export interface PublicProductCard {
  slug: string;
  name: string;
  images: string[];
  priceMode: "FIXED" | "TIERED" | "ON_REQUEST";
  priceAmount: string | null;
  /** Kartta da var: kademeli fiyatlı ürün "teklif isteyin" göstermemeli. */
  priceTiers: PriceTier[] | null;
  priceCurrency: string;
  moq: string | null;
  unit: string;
  categoryId: string | null;
  excerpt: string | null;
}

export interface PublicProduct extends Omit<PublicProductCard, "excerpt"> {
  description: string | null;
  specification: string | null;
  brand: string | null;
  mpn: string | null;
  unitCode: string | null;
  videoUrl: string | null;
  externalUrl: string | null;
  documents: { url: string; title: string }[] | null;
  keywords: string[];
  attributes: Record<string, string | string[]> | null;
  /**
   * Gösterim için ETİKETLENMİŞ nitelikler — ham `attributes` anahtarları
   * ziyaretçiye gösterilmez ("koruma_sinifi" değil "Koruma sınıfı (IP)").
   * Kategori tanımı bulunamayan anahtar bu listede YOKTUR.
   */
  attributeList: { key: string; label: string; value: string; unit: string | null }[];
  publishedAt: string | null;
  updatedAt: string;
}

export interface PublicProductCompany {
  name: string;
  slug: string | null;
  city: string | null;
  country: string | null;
  logoUrl: string | null;
  industry: string | null;
  activities: string[];
}

export interface PublicProductPage {
  items: PublicProductCard[];
  total: number;
  page: number;
  pageSize: number;
}

const EMPTY_PRODUCTS: PublicProductPage = {
  items: [],
  total: 0,
  page: 1,
  pageSize: 24,
};

/* ------------------------------------------------------------------ */
/* Ürün dizini (firmalar arası)                                        */
/* ------------------------------------------------------------------ */

/**
 * Dizin kartı firma REFERANSI taşır — firma altı `PublicProductCard` taşımaz
 * (orada firma zaten URL'de). İlan kartının tersi olduğu için tip de ayrı:
 * ilan kartına yanlışlıkla firma eklenmesi derleme hatası vermeli.
 */
export interface ProductIndexCard extends PublicProductCard {
  company: {
    name: string;
    slug: string;
    city: string | null;
    country: string | null;
  };
}

export interface ProductIndexPage {
  items: ProductIndexCard[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ProductAttributeFacet {
  key: string;
  nameTr: string;
  unit: string | null;
  values: { value: string; count: number }[];
}

export interface ProductFacets {
  categories: { id: string; name: string; level: number; count: number }[];
  cities: { city: string; count: number }[];
  /** YALNIZ kategori seçiliyken dolu — nitelikler kategoriye özgü. */
  attributes: ProductAttributeFacet[];
  truncated: boolean;
}

export interface ProductListParams {
  q?: string;
  category?: string;
  city?: string;
  /** `anahtar:değer` çiftleri — uçta tekrarlanan `attr` parametresine döner. */
  attr?: string[];
  page?: number;
}

const EMPTY_PRODUCT_INDEX: ProductIndexPage = {
  items: [],
  total: 0,
  page: 1,
  pageSize: 24,
};

const EMPTY_PRODUCT_FACETS: ProductFacets = {
  categories: [],
  cities: [],
  attributes: [],
  truncated: false,
};

export function fetchProducts(
  params: ProductListParams = {},
): Promise<ProductIndexPage> {
  const sp = new URLSearchParams();
  if (params.q) sp.set("q", params.q);
  if (params.category) sp.set("category", params.category);
  if (params.city) sp.set("city", params.city);
  // Tekrarlanan parametre (append) — değerler ayraç içerebilir, birleştirmek
  // ilk ayraçlı seçenekte sessizce bölerdi.
  for (const a of params.attr ?? []) sp.append("attr", a);
  if (params.page && params.page > 1) sp.set("page", String(params.page));
  const qs = sp.toString();
  // Ürün kalıcı içerik — ilandan uzun önbellek (uçtaki `s-maxage` ile aynı).
  return getJson(`/public/products${qs ? `?${qs}` : ""}`, EMPTY_PRODUCT_INDEX, 300);
}

export function fetchProductFacets(category?: string): Promise<ProductFacets> {
  const qs = category ? `?category=${encodeURIComponent(category)}` : "";
  return getJson(`/public/products/facets${qs}`, EMPTY_PRODUCT_FACETS, 600);
}

export function fetchCompanyProducts(
  companySlug: string,
  params: { q?: string; categoryId?: string; page?: number } = {},
): Promise<PublicProductPage> {
  const sp = new URLSearchParams();
  if (params.q) sp.set("q", params.q);
  if (params.categoryId) sp.set("categoryId", params.categoryId);
  if (params.page && params.page > 1) sp.set("page", String(params.page));
  const qs = sp.toString();
  return getJson(
    `/public/companies/${encodeURIComponent(companySlug)}/products${qs ? `?${qs}` : ""}`,
    EMPTY_PRODUCTS,
    300,
  );
}

/**
 * Tekil ürün. `null` = yok/erişilemez → sayfa `notFound()` çağırır.
 * Listede boş dönmek kabul edilebilir ama detayda "bulunamadı" 404 olmalı.
 */
export async function fetchProduct(
  companySlug: string,
  productSlug: string,
): Promise<{ product: PublicProduct; company: PublicProductCompany } | null> {
  const base = resolveApiBaseUrl();
  if (!base) return null;
  try {
    const res = await fetch(
      `${base}/public/companies/${encodeURIComponent(companySlug)}/products/${encodeURIComponent(productSlug)}`,
      { next: { revalidate: 300 }, headers: { accept: "application/json" } },
    );
    if (!res.ok) return null;
    return (await res.json()) as {
      product: PublicProduct;
      company: PublicProductCompany;
    };
  } catch (err) {
    console.error(`[urun] ${companySlug}/${productSlug} çağrısı başarısız`, err);
    return null;
  }
}

export interface ProductSitemapRow {
  companySlug: string;
  slug: string;
  updatedAt: string;
}

export function fetchProductSitemap(): Promise<ProductSitemapRow[]> {
  return getJson<ProductSitemapRow[]>(
    "/public/companies/products/sitemap",
    [],
    900,
  );
}
