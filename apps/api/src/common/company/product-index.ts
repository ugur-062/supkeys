import { Prisma } from "@rothern/db";
import { categoryPrefix, isCompanyActivity, tokenizeQuery } from "@rothern/shared";
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
  city?: string;
  activity?: string;
  verified?: boolean;
  price?: "has" | "request";
  attr?: string[];
  sort?: "relevance" | "newest" | "price";
}

export const PRODUCT_PAGE_SIZE = 24;
export const PRODUCT_FACET_SCAN_CAP = 5000;

export function productSearchClauses(raw?: string): Prisma.CompanyItemWhereInput[] {
  const tokens = raw ? tokenizeQuery(raw) : [];
  // `searchText` = fold(ad + marka + mpn + anahtar kelimeler); tokenler
  // AND'lenir, sıra önemsiz (kategori aramasıyla aynı kural).
  return tokens.map((t) => ({ searchText: { contains: t } }));
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
  const and: Prisma.CompanyItemWhereInput[] = [
    ...productSearchClauses(q.q),
    // Şehir AYRI bir yan koşul: `publicProductWhere` de `company` altında
    // filtreliyor ve tek nesnede aynı anahtar iki kez bulunamaz.
    ...(q.city ? [{ company: { city: q.city } }] : []),
    ...(q.activity && isCompanyActivity(q.activity)
      ? [{ company: { activities: { has: q.activity } } }]
      : []),
    ...(q.verified ? [{ company: { companyVerificationStatus: "VERIFIED" as const } }] : []),
    ...(q.price === "has"
      ? [{ priceMode: { in: ["FIXED" as const, "TIERED" as const] } }]
      : q.price === "request"
        ? [{ priceMode: "ON_REQUEST" as const }]
        : []),
    ...attributeClauses(q.attr),
    ...extra,
  ];
  return {
    ...publicProductWhere(),
    ...productCategoryWhere(q.category),
    ...(and.length ? { AND: and } : {}),
  };
}

/** Varsayılan "uygunluk": eksiksiz ürün önce; `price` artan, fiyatsız SONDA. */
export function productIndexOrderBy(
  sort?: ProductIndexParams["sort"],
): Prisma.CompanyItemOrderByWithRelationInput[] {
  if (sort === "newest") return [{ publishedAt: "desc" }, { completionScore: "desc" }];
  if (sort === "price") return [{ priceAmount: { sort: "asc", nulls: "last" } }, { completionScore: "desc" }];
  return [{ completionScore: "desc" }, { publishedAt: "desc" }];
}

export interface ProductFacetRow {
  categoryId: string | null;
  company: { city: string | null; activities: string[] };
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
