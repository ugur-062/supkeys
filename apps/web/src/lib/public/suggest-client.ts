import type { CategoryMenuNode, SuggestResult } from "./marketplace-api";
import { resolveApiBaseUrl } from "@/lib/resolve-api-url";

/**
 * ÖNERİ VE MENÜ — İSTEMCİ tarafı tek kaynak (PROMPT 6).
 *
 * Hero araması ile üst çubuk typeahead'i AYNI uçtan, aynı biçimde okur;
 * iki kopya olsaydı biri ötekinden sessizce ayrışırdı (bu depoda en sık
 * tekrar eden hata). Uçlar herkese açık (`public/*`) — PANELDE
 * KULLANILMAZ: panelin kendi auth'lu uçları var (CLAUDE.md § Pazar yerinin
 * herkese açık uçları panelde kullanılmaz).
 *
 * Hata yutulur: öneri gelmezse arama formu yine çalışır (ilerleyici geliştirme).
 */
export const EMPTY_SUGGEST: SuggestResult = { products: [], categories: [], companies: [], listings: [] };

export type SuggestScope = "products" | "companies" | "listings";

export async function fetchSuggest(q: string, scope?: SuggestScope): Promise<SuggestResult> {
  const term = q.trim();
  if (term.length < 2) return EMPTY_SUGGEST;
  const base = resolveApiBaseUrl();
  if (!base) return EMPTY_SUGGEST;
  try {
    const url = `${base}/public/suggest?q=${encodeURIComponent(term)}${scope ? `&scope=${scope}` : ""}`;
    const res = await fetch(url);
    if (!res.ok) return EMPTY_SUGGEST;
    const data = (await res.json()) as SuggestResult;
    return { ...EMPTY_SUGGEST, ...data };
  } catch {
    return EMPTY_SUGGEST;
  }
}

/**
 * Mega menü ağacı — ilk açılışta (ya da düğmeye hover'da) bir kez çekilir,
 * modül düzeyinde önbelleklenir. Sayfa HTML'ine gömülmez: kabuk (`PublicLayout`)
 * her herkese açık sayfada çiziliyor, ağacı sunucuda beklemek her sayfayı
 * bir tur yavaşlatırdı. Kategori bağlantıları SEO için zaten footer'da,
 * sitemap'te ve kategori sayfalarında var.
 */
let menuCache: Promise<CategoryMenuNode[]> | null = null;

export function fetchCategoryMenu(): Promise<CategoryMenuNode[]> {
  if (menuCache) return menuCache;
  menuCache = (async () => {
    const base = resolveApiBaseUrl();
    if (!base) return [];
    try {
      const res = await fetch(`${base}/public/categories/menu`);
      if (!res.ok) return [];
      return (await res.json()) as CategoryMenuNode[];
    } catch {
      return [];
    }
  })().catch(() => []);
  return menuCache;
}

/** Son aramalar — yalnız bu tarayıcıda; erişilemezse sessizce devre dışı. */
const RECENT_KEY = "rothern.recent-search";
const RECENT_MAX = 5;

export function readRecentSearches(): string[] {
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === "string").slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

export function pushRecentSearch(term: string): void {
  const t = term.trim();
  if (t.length < 2) return;
  try {
    const next = [t, ...readRecentSearches().filter((x) => x.toLocaleLowerCase("tr") !== t.toLocaleLowerCase("tr"))].slice(0, RECENT_MAX);
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* özel pencere / kapalı depolama — öneri kaybı kabul */
  }
}
