import { Prisma } from "@rothern/db";
import { categoryPrefix, foldSearchText, isCompanyActivity, stemPrefix, tokenizeQuery } from "@rothern/shared";
import { publicProductWhere } from "./public-profile-gate";

/**
 * ÜRÜN DİZİNİ — where/orderBy/facet TEK KAYNAK (2026-09-04).
 *
 * Herkese açık `/urunler` ile panelin "Ürün Ara"sı aynı süzgeç kümesini
 * (arama, kategori alt ağacı, şehir, faaliyet, doğrulanmış, fiyat, nitelik)
 * ve aynı sıralamayı okur. İki kopya olsaydı üye, ziyaretçiden farklı bir
 * sonuç görürdü (kullanıcı bulgusu: "üye girişiyle tutarsız").
 */
export interface ProductIndexParams {
  q?: string;
  category?: string;
  /** Tek değer ya da virgüllü liste ("İstanbul,İzmir") — ÇOKLU seçim. */
  city?: string;
  /** Tek kod ya da virgüllü liste — ÇOKLU seçim. */
  activity?: string;
  verified?: boolean;
  price?: "has" | "request";
  /** TRY cinsinden birim fiyat aralığı (yalnız fiyatı yazılı ürünler). */
  priceMin?: number;
  priceMax?: number;
  /** "Min. sipariş ≤ X" — MOQ'su bu değerden küçük/eşit ya da hiç olmayanlar. */
  moqMax?: number;
  attr?: string[];
  sort?: "relevance" | "newest" | "price" | "price_desc";
}

/** Virgüllü çoklu değer → dizi (boşlar düşer, tavan 10). */
export function multi(v?: string): string[] {
  return (v ?? "").split(",").map((x) => x.trim()).filter(Boolean).slice(0, 10);
}

export const PRODUCT_PAGE_SIZE = 24;
export const PRODUCT_FACET_SCAN_CAP = 5000;

export function productSearchClauses(raw?: string): Prisma.CompanyItemWhereInput[] {
  const tokens = raw ? tokenizeQuery(raw) : [];
  // `searchText` = fold(ad + marka + mpn + anahtar kelimeler); tokenler
  // AND'lenir, sıra önemsiz (kategori aramasıyla aynı kural). Token
  // KATLANIR — ham "Çelik" katlanmış "celik" metninde hiç eşleşmiyordu
  // (2026-09-05 düzeltmesi). Firma ADI da aranır: tek kutu "ürün ya da
  // firma" (Europages) — "Trakya Elektrik" yazan o firmanın ürünlerini bulur.
  // Türkçe ek toleransı (`stemPrefix`): "boruları" → "boru", "panosu" → "pano".
  return tokens.map((t) => ({
    OR: [
      { searchText: { contains: stemPrefix(foldSearchText(t)) } },
      { company: { name: { contains: t, mode: "insensitive" as const } } },
    ],
  }));
}

/**
 * Nitelik süzgeci — `attributes` JSON'ı üzerinde. Değer tekli seçimde dize,
 * çoklu seçimde dizi; ikisi OR'lanır (tek biçim aransa kategorinin yarısı
 * sessizce boş dönerdi). `attributes` üzerinde indeks YOK (bilinen sınır).
 */
export function attributeClauses(raw?: string[]): Prisma.CompanyItemWhereInput[] {
  const out: Prisma.CompanyItemWhereInput[] = [];
  for (const entry of raw ?? []) {
    const i = entry.indexOf(":");
    if (i <= 0) continue;
    const key = entry.slice(0, i);
    const value = entry.slice(i + 1).trim();
    if (!value) continue;
    out.push({
      OR: [
        { attributes: { path: [key], equals: value } },
        { attributes: { path: [key], array_contains: [value] } },
      ],
    });
  }
  return out;
}

/** Kategori süzgeci ALT AĞACI kapsar (`categoryPrefix`, seviye × 2 hane). */
export function productCategoryWhere(code?: string): Prisma.CompanyItemWhereInput {
  const prefix = code ? categoryPrefix(code) : null;
  if (!prefix) return {};
  return { categoryId: { startsWith: prefix } };
}

export function productIndexWhere(
  q: ProductIndexParams,
  extra: Prisma.CompanyItemWhereInput[] = [],
): Prisma.CompanyItemWhereInput {
  const cities = multi(q.city);
  const activities = multi(q.activity).filter(isCompanyActivity);
  const and: Prisma.CompanyItemWhereInput[] = [
    ...productSearchClauses(q.q),
    // Şehir AYRI bir yan koşul: `publicProductWhere` de `company` altında
    // filtreliyor ve tek nesnede aynı anahtar iki kez bulunamaz. Çoklu seçim
    // = OR (İstanbul VEYA İzmir).
    ...(cities.length ? [{ company: { city: { in: cities } } }] : []),
    ...(activities.length ? [{ company: { activities: { hasSome: activities } } }] : []),
    ...(q.verified ? [{ company: { companyVerificationStatus: "VERIFIED" as const } }] : []),
    ...(q.price === "has"
      ? [{ priceMode: { in: ["FIXED" as const, "TIERED" as const] } }]
      : q.price === "request"
        ? [{ priceMode: "ON_REQUEST" as const }]
        : []),
    // Fiyat aralığı yalnız yazılı birim fiyatı olanlara uygulanır (sabit fiyat;
    // kademeli ürünlerin tabanı priceAmount'ta yok — kapsam dışı, bilinçli).
    ...(q.priceMin != null || q.priceMax != null
      ? [{ priceAmount: { ...(q.priceMin != null ? { gte: q.priceMin } : {}), ...(q.priceMax != null ? { lte: q.priceMax } : {}) } }]
      : []),
    ...(q.moqMax != null ? [{ OR: [{ moq: null }, { moq: { lte: q.moqMax } }] }] : []),
    ...attributeClauses(q.attr),
    ...extra,
  ];
  return {
    ...publicProductWhere(),
    ...productCategoryWhere(q.category),
    ...(and.length ? { AND: and } : {}),
  };
}

/**
 * Varsayılan "uygunluk": PAKETLİ firma önce (2026-09-06 — "görünmek ücretsiz,
 * öne çıkmak paketli"), sonra eksiksiz ürün; `newest` de paketli önce.
 * `price` artan/azalan paketten BAĞIMSIZ (kullanıcı açıkça fiyat istedi),
 * fiyatsız SONDA.
 *
 * Paket sırası DB enum'undan (`CompanyTier` STANDART < SILVER < GOLD →
 * `desc`); süresi dolmuş paket kademe cron'u düşürene dek paketli sıralanır —
 * yalnız SIRA (erişim değil), o pencere kabul.
 */
export function productIndexOrderBy(
  sort?: ProductIndexParams["sort"],
): Prisma.CompanyItemOrderByWithRelationInput[] {
  const paidFirst = { company: { tier: "desc" as const } };
  if (sort === "newest") return [paidFirst, { publishedAt: "desc" }, { completionScore: "desc" }];
  if (sort === "price") return [{ priceAmount: { sort: "asc", nulls: "last" } }, { completionScore: "desc" }];
  if (sort === "price_desc") return [{ priceAmount: { sort: "desc", nulls: "last" } }, { completionScore: "desc" }];
  return [paidFirst, { completionScore: "desc" }, { publishedAt: "desc" }];
}

export interface ProductFacetRow {
  categoryId: string | null;
  priceMode?: string;
  company: { city: string | null; activities: string[]; companyVerificationStatus?: string };
}

/**
 * BAĞLAMA DUYARLI facet sayımı (klasik faceted search): her boyutun sayısı,
 * DİĞER seçili süzgeçler uygulanmış küme üzerinden hesaplanır; kendi boyutu
 * hariç tutulur ki çoklu seçimde "İzmir (4)" seçili İstanbul'a rağmen doğru
 * kalsın. Satırlar zaten arama + kategori (sert süzgeçler) ile daraltılmış
 * gelir; şehir/faaliyet/doğrulanmış/fiyat burada bellekte uygulanır.
 */
export function contextualFacetCounts(rows: ProductFacetRow[], sel: ProductIndexParams) {
  const cities = new Set(multi(sel.city));
  const acts = new Set(multi(sel.activity));
  const okCity = (r: ProductFacetRow) => cities.size === 0 || (!!r.company.city && cities.has(r.company.city));
  const okAct = (r: ProductFacetRow) => acts.size === 0 || r.company.activities.some((a) => acts.has(a));
  const okVer = (r: ProductFacetRow) => !sel.verified || r.company.companyVerificationStatus === "VERIFIED";
  const okPrice = (r: ProductFacetRow) =>
    !sel.price || (sel.price === "has" ? r.priceMode !== "ON_REQUEST" : r.priceMode === "ON_REQUEST");
  const count = (rs: ProductFacetRow[], key: (r: ProductFacetRow) => string[]) => {
    const m = new Map<string, number>();
    for (const r of rs) for (const k of new Set(key(r))) m.set(k, (m.get(k) ?? 0) + 1);
    return m;
  };
  const forCity = rows.filter((r) => okAct(r) && okVer(r) && okPrice(r));
  const forAct = rows.filter((r) => okCity(r) && okVer(r) && okPrice(r));
  const forVer = rows.filter((r) => okCity(r) && okAct(r) && okPrice(r));
  const forPrice = rows.filter((r) => okCity(r) && okAct(r) && okVer(r));
  const forCat = rows.filter((r) => okCity(r) && okAct(r) && okVer(r) && okPrice(r));
  return {
    categories: [...count(forCat, (r) => (r.categoryId && r.categoryId.length === 8 ? [`${r.categoryId.slice(0, 2)}000000`] : [])).entries()],
    cities: [...count(forCity, (r) => (r.company.city?.trim() ? [r.company.city.trim()] : [])).entries()]
      .map(([city, count]) => ({ city, count }))
      .sort((a, b) => b.count - a.count || a.city.localeCompare(b.city, "tr")),
    activities: [...count(forAct, (r) => r.company.activities).entries()]
      .map(([activity, count]) => ({ activity, count }))
      .sort((a, b) => b.count - a.count),
    verified: forVer.filter((r) => r.company.companyVerificationStatus === "VERIFIED").length,
    price: {
      has: forPrice.filter((r) => r.priceMode !== "ON_REQUEST").length,
      request: forPrice.filter((r) => r.priceMode === "ON_REQUEST").length,
    },
  };
}

/** Sektör (L1) / şehir / faaliyet sayaçları — kategori adı çağıran çözer. */
export function productFacetCounts(rows: ProductFacetRow[]) {
  const catCount = new Map<string, number>();
  const cityCount = new Map<string, number>();
  const actCount = new Map<string, number>();
  for (const r of rows) {
    const city = r.company.city?.trim();
    if (city) cityCount.set(city, (cityCount.get(city) ?? 0) + 1);
    for (const a of r.company.activities) actCount.set(a, (actCount.get(a) ?? 0) + 1);
    if (r.categoryId && r.categoryId.length === 8) {
      const seg = `${r.categoryId.slice(0, 2)}000000`;
      catCount.set(seg, (catCount.get(seg) ?? 0) + 1);
    }
  }
  return {
    categories: [...catCount.entries()],
    cities: [...cityCount.entries()]
      .map(([city, count]) => ({ city, count }))
      .sort((a, b) => b.count - a.count || a.city.localeCompare(b.city, "tr")),
    activities: [...actCount.entries()]
      .map(([activity, count]) => ({ activity, count }))
      .sort((a, b) => b.count - a.count),
  };
}
