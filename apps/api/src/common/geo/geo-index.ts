import {
  SPECIAL_GEO_CITIES,
  foldSearchText,
  haversineKm,
  pickGeoCity,
  resolveProvince,
  trProvinceCityId,
  type GeoCityCandidate,
} from "@rothern/shared";
import type { Locale } from "@rothern/i18n";

/**
 * DÜNYA ŞEHİR DİZİNİ — bellek içi (2026-09-27, kullanıcı: "şehir sayfaları
 * türkiye özel olamaz, bu uluslararası bir sistem").
 *
 * `geo_cities` (~34 bin satır, ~7 MB) açılışta `GeoCityService` tarafından
 * yüklenir ve `setGeoIndex` ile buraya kaydedilir; SAF fonksiyonlar (ürün
 * dizini, firma dizini, facet'ler) `geoIndex()` ile okur — çağrı imzaları
 * değişmez. Yüklenmeden önce (açılış anı, birim testleri) yalnız Türkiye'nin
 * 81 ili + KKTC ile çalışan YEDEK dizin döner: Türkiye akışı hiçbir an kırılmaz.
 */
export interface GeoCityRow extends GeoCityCandidate {
  countryCode: string;
  slug: string;
  lat: number;
  lng: number;
}

export class GeoIndex {
  private readonly byIdMap = new Map<number, GeoCityRow>();
  private readonly bySlugMap = new Map<string, GeoCityRow>();
  private readonly byCountry = new Map<string, GeoCityRow[]>();
  /** Katlanmış ad (herhangi bir dil) → en kalabalık kayıt (TR illeri önce). */
  private readonly byFoldedName = new Map<string, GeoCityRow>();

  constructor(readonly rows: readonly GeoCityRow[]) {
    for (const r of rows) {
      this.byIdMap.set(r.id, r);
      this.bySlugMap.set(r.slug, r);
      const list = this.byCountry.get(r.countryCode) ?? [];
      list.push(r);
      this.byCountry.set(r.countryCode, list);
      for (const n of [r.name, r.nameTr, r.nameEn, r.nameRu]) {
        if (!n) continue;
        const k = foldSearchText(n);
        const cur = this.byFoldedName.get(k);
        const rank = (x: GeoCityRow) => (x.countryCode === "TR" ? Number.MAX_SAFE_INTEGER : x.population);
        if (!cur || rank(r) > rank(cur)) this.byFoldedName.set(k, r);
      }
    }
  }

  get size(): number {
    return this.rows.length;
  }

  byId(id: number | null | undefined): GeoCityRow | null {
    return id == null ? null : (this.byIdMap.get(id) ?? null);
  }

  bySlug(slug: string | null | undefined): GeoCityRow | null {
    return slug ? (this.bySlugMap.get(slug.trim().toLowerCase()) ?? null) : null;
  }

  /**
   * URL/süzgeç değeri → şehir kaydı. Kalıcı adres ("bursa", "de-munich") ya
   * da ESKİ bağlantılardaki ham Türk il adı ("İstanbul" — `?sehir=` eskiden
   * ham ad taşıyordu, gönderilmiş bağlantılar kırılmasın).
   */
  resolveParam(value: string | null | undefined): GeoCityRow | null {
    const v = (value ?? "").trim();
    if (!v) return null;
    return this.bySlug(v) ?? this.byId(trProvinceCityId(v)) ?? this.byFoldedName.get(foldSearchText(v)) ?? null;
  }

  /** Serbest metin şehir → kayıt id'si (ülke içinde; bkz. `pickGeoCity`). */
  resolveText(country: string | null | undefined, cityText: string | null | undefined): number | null {
    const cc = (country ?? "TR").toUpperCase();
    return pickGeoCity(cc, cityText, this.byCountry.get(cc) ?? []);
  }

  /**
   * "Yakınımda" merkezi: kalıcı adres, Türk il adı ya da Türk posta kodu
   * (5 hane — eskiden olduğu gibi). Yabancı posta kodu ÇÖZÜLMEZ (Berlin
   * 10115 Balıkesir sanılmasın): rakam yalnız Türkiye için anlamlı.
   */
  resolveNear(value: string | null | undefined): GeoCityRow | null {
    const v = (value ?? "").trim();
    if (!v) return null;
    const direct = this.resolveParam(v);
    if (direct) return direct;
    const province = resolveProvince(v);
    return province ? this.byId(-(1000 + province.plate)) : null;
  }

  /** Merkezden `km` içindeki şehirlerin id'leri (merkez dahil). */
  within(origin: GeoCityRow, km: number): number[] {
    const out: number[] = [];
    for (const r of this.rows) if (haversineKm(origin, r) <= km) out.push(r.id);
    return out;
  }

  /** Okuyucunun dilinde ad. */
  label(row: GeoCityRow, locale: Locale): string {
    if (locale === "en") return row.nameEn || row.name;
    if (locale === "ru") return row.nameRu || row.nameEn || row.name;
    return row.nameTr || row.name;
  }

  /** Şehir arama önerisi: katlanmış ad önekle ya da içerikle; nüfusa göre. */
  search(q: string, opts: { country?: string | null; limit?: number } = {}): GeoCityRow[] {
    const f = foldSearchText(q.trim());
    if (f.length < 2) return [];
    const pool = opts.country ? (this.byCountry.get(opts.country.toUpperCase()) ?? []) : this.rows;
    const scored: { r: GeoCityRow; s: number }[] = [];
    for (const r of pool) {
      const hay = r.searchText;
      const i = hay.indexOf(f);
      if (i < 0) continue;
      const wordStart = i === 0 || hay[i - 1] === " ";
      // TR illeri Türkiye içi aramada hep üstte (nüfus alanı boş).
      scored.push({ r, s: (wordStart ? 2 : 1) * 1e9 + (r.countryCode === "TR" ? 5e8 : r.population) });
    }
    return scored
      .sort((a, b) => b.s - a.s)
      .slice(0, opts.limit ?? 10)
      .map((x) => x.r);
  }
}

function fallbackRows(): GeoCityRow[] {
  return SPECIAL_GEO_CITIES.map((c) => ({
    id: c.id,
    countryCode: c.countryCode,
    name: c.name,
    nameTr: c.nameTr,
    nameEn: c.nameEn,
    nameRu: c.nameRu,
    slug: c.slug,
    lat: c.lat,
    lng: c.lng,
    population: 0,
    searchText: foldSearchText([c.name, c.nameEn, c.nameRu].join(" ")),
  }));
}

let current: GeoIndex | null = null;
let fallback: GeoIndex | null = null;

/** Güncel dizin (yüklenmediyse Türkiye + KKTC yedeği). */
export function geoIndex(): GeoIndex {
  if (current) return current;
  fallback ??= new GeoIndex(fallbackRows());
  return fallback;
}

export function setGeoIndex(index: GeoIndex | null): void {
  current = index;
}

/**
 * Saklanan şehir METNİ: şehir listeden eşlendiyse TEK biçim — Türkiye/KKTC'de
 * Türkçe ad ("İstanbul"), diğer ülkelerde İngilizce yazım ("Munich"). Seçici
 * adı arayüz dilinde verir; eşlemesiz saklansaydı Rusça panelden kayıt olan
 * firmanın şehri "Мюнхен" olarak herkese görünürdü (2026-09-27 denetimi).
 * Eşleşmeyen serbest metin olduğu gibi kalır.
 */
export function storedCityName(cityId: number | null, text: string | null | undefined): string | null {
  const row = geoIndex().byId(cityId);
  if (row) return row.countryCode === "TR" || row.countryCode === "XN" ? row.nameTr || row.name : row.nameEn || row.name;
  return text?.trim() || null;
}

/**
 * Yazma yolu: firma/adres şehri → `cityId` (kayıt, profil, adres, admin).
 * İstemci aynı ülkeden geçerli bir id gönderdiyse o; yoksa metinden eşleme;
 * eşleşmezse null (şehir metin olarak yine kaydedilir, yalnız şehir sayfasına
 * ve şehir süzgecine girmez).
 */
export function resolveCityId(
  country: string | null | undefined,
  cityText: string | null | undefined,
  cityId?: number | null,
): number | null {
  const idx = geoIndex();
  const cc = (country ?? "TR").toUpperCase();
  if (cityId != null) {
    const row = idx.byId(cityId);
    if (row && row.countryCode === cc) return row.id;
  }
  return idx.resolveText(cc, cityText);
}
