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
