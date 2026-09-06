import type { PrismaClient } from "@rothern/db";
import { isCategoryCode, isCompanyActivity, looksLikeProse, PAID_TIER, profileCompleteness, tierAtLeast, tokenizeQuery, type TierName } from "@rothern/shared";
import { effectiveTier } from "./effective-tier";
import { PUBLIC_PROFILE_WHERE, publicProductWhere } from "./public-profile-gate";

type Db = Pick<PrismaClient, "company" | "category">;

export interface DirectoryParams {
  q?: string;
  /** Virgüllü çoklu şehir. */
  city?: string;
  /** Virgüllü çoklu 8 haneli kod (alıcı ya da satıcı beyanı). */
  category?: string;
  /** Virgüllü çoklu faaliyet kodu. */
  activity?: string;
  verified?: boolean;
  hasProducts?: boolean;
  /** Yalnız efektif GOLD. */
  gold?: boolean;
  /** relevance (paketli önce, sonra güncellik) | name | products | newest. */
  sort?: "relevance" | "name" | "products" | "newest";
  page?: number;
}

/** Sayfa başına 20 firma kartı (PROMPT 4; eskiden 24). */
export const DIRECTORY_PAGE_SIZE = 20;

const multi = (v?: string) => (v ?? "").split(",").map((x) => x.trim()).filter(Boolean).slice(0, 10);

/** Efektif GOLD — süzgeç (`gold=1`), sıra ve kart rozeti aynı hesabı okur. */
const isGold = (r: { tier: string; membershipEndAt: Date | null }) =>
  effectiveTier(r.tier as TierName, r.membershipEndAt) === "GOLD";

/**
 * FİRMA DİZİNİ — TEK KAYNAK (2026-09-04): herkese açık `/firmalar` ile panelin
 * Bağlantılar › Keşfet sekmesi aynı kümeyi, aynı sırayı ve aynı kartı okur.
 * Listelenme koşulu: profil kapısı (publicEnabled ∧ aktif ∧ bloksuz — paket
 * şartı YOK, 2026-09-06) ∧ (≥1 yayında ürün ∨ profil tamlığı ≥ %60). Tamlık
 * `profileCompleteness` (Profilim ile aynı hesap); test verili Hakkında
 * tamlığa SAYILMAZ.
 *
 * SIRA: paketli (efektif SILVER+) firmalar ÖNCE, sonra ücretsiz; grup içinde
 * son güncellenen önce. "Görünmek ücretsiz, öne çıkmak paketli" — paketin
 * dizindeki karşılığı görünürlük değil öncelik.
 *
 * Panel `excludeIds` (kendisi + engelledikleri) verir ve kartlara rothernId /
 * bağlantı durumu ekler; public bunları düşürür.
 */
/**
 * Listelenme koşulundan geçen TÜM satırlar (sayfasız, sıralı) — `buildDirectory`
 * sayfalar, `directoryFacets` sayar. İkisi aynı kümeyi okur.
 */
export async function directoryRows(
  prisma: Db,
  q: DirectoryParams,
  opts: { excludeIds?: string[] } = {},
) {
  const tokens = q.q ? tokenizeQuery(q.q) : [];
  const cities = multi(q.city);
  const activities = multi(q.activity).filter(isCompanyActivity);
  const categories = multi(q.category).filter(isCategoryCode);
  const rows = await prisma.company.findMany({
    where: {
      ...PUBLIC_PROFILE_WHERE,
      ...(opts.excludeIds?.length ? { id: { notIn: opts.excludeIds } } : {}),
      ...(cities.length === 1 ? { city: cities[0] } : cities.length > 1 ? { city: { in: cities } } : {}),
      ...(activities.length ? { activities: { hasSome: activities } } : {}),
      ...(q.verified ? { companyVerificationStatus: "VERIFIED" } : {}),
      ...(categories.length
        ? {
            OR: [
              { buyerCategoryIds: { hasSome: categories } },
              { buyerSubCategoryIds: { hasSome: categories } },
              { sellerCategoryIds: { hasSome: categories } },
              { sellerSubCategoryIds: { hasSome: categories } },
            ],
          }
        : {}),
      ...(tokens.length
        ? {
            AND: tokens.map((t) => ({
              OR: [
                { name: { contains: t, mode: "insensitive" as const } },
                { industry: { contains: t, mode: "insensitive" as const } },
                { aboutText: { contains: t, mode: "insensitive" as const } },
                { services: { has: t } },
                { rothernId: { contains: t.toUpperCase() } },
              ],
            })),
          }
        : {}),
    },
    select: {
      id: true,
      rothernId: true,
      name: true,
      slug: true,
      city: true,
      country: true,
      industry: true,
      activities: true,
      logoUrl: true,
      coverImageUrl: true,
      aboutText: true,
      services: true,
      photos: true,
      foundedYear: true,
      employeeCount: true,
      certifications: true,
      website: true,
      buyerCategoryIds: true,
      sellerCategoryIds: true,
      companyVerificationStatus: true,
      tier: true,
      membershipEndAt: true,
      updatedAt: true,
      createdAt: true,
      items: {
        where: publicProductWhere(),
        select: { slug: true, name: true, images: true },
        orderBy: [{ completionScore: "desc" as const }, { publishedAt: "desc" as const }],
        take: 3,
      },
      _count: { select: { items: { where: publicProductWhere() } } },
    },
    orderBy: [{ updatedAt: "desc" }],
    take: 5000,
  });
  const paidRank = (r: { tier: string; membershipEndAt: Date | null }) =>
    tierAtLeast(effectiveTier(r.tier as TierName, r.membershipEndAt), PAID_TIER) ? 0 : 1;
  const eligible = rows.filter((r) => {
    const productCount = r._count.items;
    if (q.hasProducts && productCount === 0) return false;
    if (q.gold && !isGold(r)) return false;
    if (productCount > 0) return true;
    return profileCompleteness({ ...r, aboutText: looksLikeProse(r.aboutText) ? r.aboutText : null }).pct >= 60;
  });
  // Sıralama (PROMPT 4): varsayılan uygunluk = paketli önce, grup içinde
  // güncellik; A-Z, en çok ürün ve en yeni açık sıralamalar paketten bağımsız.
  const sort = q.sort ?? "relevance";
  if (sort === "name") eligible.sort((a, b) => a.name.localeCompare(b.name, "tr"));
  else if (sort === "products") eligible.sort((a, b) => b._count.items - a._count.items || a.name.localeCompare(b.name, "tr"));
  else if (sort === "newest") eligible.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  else eligible.sort((a, b) => paidRank(a) - paidRank(b)); // kararlı: updatedAt sırası korunur
  return eligible;
}

export async function buildDirectory(
  prisma: Db,
  q: DirectoryParams,
  opts: { excludeIds?: string[] } = {},
) {
  const pageSize = DIRECTORY_PAGE_SIZE;
  const page = Math.max(1, q.page ?? 1);
  const eligible = await directoryRows(prisma, q, opts);
  const total = eligible.length;
  const slice = eligible.slice((page - 1) * pageSize, page * pageSize);
  const ids = [...new Set(slice.flatMap((r) => [...r.sellerCategoryIds, ...r.buyerCategoryIds].slice(0, 1)))].filter(isCategoryCode);
  const cats = ids.length
    ? await prisma.category.findMany({ where: { id: { in: ids } }, select: { id: true, nameTr: true } })
    : [];
  const nameById = new Map(cats.map((c) => [c.id, c.nameTr]));
  return {
    items: slice.map((r) => {
      const main = [...r.sellerCategoryIds, ...r.buyerCategoryIds].find((id) => nameById.has(id));
      return {
        id: r.id,
        rothernId: r.rothernId,
        name: r.name,
        slug: r.slug as string,
        city: r.city,
        country: r.country,
        industry: r.industry,
        activities: r.activities,
        logoUrl: r.logoUrl,
        verified: r.companyVerificationStatus === "VERIFIED",
        /** Kartta "Gold Üye" rozeti — `gold=1` süzgeci PROMPT 4'te vardı, karşılığı kartta yoktu. */
        gold: isGold(r),
        /** Kart açıklaması; test verisi herkese açık yüzeyde ÇIKMAZ (looksLikeProse). */
        about: looksLikeProse(r.aboutText) ? (r.aboutText as string) : null,
        foundedYear: r.foundedYear,
        employeeCount: r.employeeCount,
        certifications: r.certifications.slice(0, 3),
        mainCategory: main ? { id: main, name: nameById.get(main) as string } : null,
        productCount: r._count.items,
        productPreview: r.items.map((i) => ({ slug: i.slug ?? "", name: i.name, image: i.images[0] ?? null })),
      };
    }),
    total,
    page,
    pageSize,
  };
}

/**
 * Dizin süzgeç sayaçları — BAĞLAMSAL (PROMPT 4): her boyut, DİĞER seçimler
 * uygulanmış hâlde sayılır (ürün dizini ve talep listesiyle aynı kural).
 * Arama (`q`) hepsine uygulanır; küme `directoryRows` (listelenme koşulu).
 */
export async function directoryFacets(
  prisma: Db,
  opts: { excludeIds?: string[] } = {},
  params: DirectoryParams = {},
) {
  const rows = await directoryRows(prisma, { q: params.q }, opts);
  type Row = (typeof rows)[number];
  const cities = multi(params.city);
  const activities = multi(params.activity).filter(isCompanyActivity);
  const categories = multi(params.category).filter(isCategoryCode);
  const cats = (r: Row) => [...r.sellerCategoryIds, ...r.buyerCategoryIds];
  const inCity = (r: Row) => cities.length === 0 || (!!r.city && cities.includes(r.city.trim()));
  const inAct = (r: Row) => activities.length === 0 || r.activities.some((a) => activities.includes(a));
  const inCat = (r: Row) => categories.length === 0 || cats(r).some((c) => categories.includes(c));
  const inVerified = (r: Row) => !params.verified || r.companyVerificationStatus === "VERIFIED";
  const inProducts = (r: Row) => !params.hasProducts || r._count.items > 0;
  const inGold = (r: Row) => !params.gold || isGold(r);
  const others = (skip: string) => (r: Row) =>
    (skip === "city" || inCity(r)) &&
    (skip === "activity" || inAct(r)) &&
    (skip === "category" || inCat(r)) &&
    (skip === "verified" || inVerified(r)) &&
    (skip === "products" || inProducts(r)) &&
    (skip === "gold" || inGold(r));

  const cityCount = new Map<string, number>();
  for (const r of rows.filter(others("city"))) {
    const city = r.city?.trim();
    if (city) cityCount.set(city, (cityCount.get(city) ?? 0) + 1);
  }
  const activityCount = new Map<string, number>();
  for (const r of rows.filter(others("activity"))) {
    for (const a of new Set(r.activities)) activityCount.set(a, (activityCount.get(a) ?? 0) + 1);
  }
  const catCount = new Map<string, number>();
  for (const r of rows.filter(others("category"))) {
    for (const c of new Set(cats(r).filter(isCategoryCode))) catCount.set(c, (catCount.get(c) ?? 0) + 1);
  }
  const catIds = [...catCount.keys()];
  const catNames = catIds.length
    ? await prisma.category.findMany({ where: { id: { in: catIds } }, select: { id: true, nameTr: true } })
    : [];
  const nameById = new Map(catNames.map((c) => [c.id, c.nameTr] as const));
  const all = rows.filter(others("none"));
  return {
    total: all.length,
    verified: rows.filter(others("verified")).filter((r) => r.companyVerificationStatus === "VERIFIED").length,
    withProducts: rows.filter(others("products")).filter((r) => r._count.items > 0).length,
    gold: rows.filter(others("gold")).filter(isGold).length,
    cities: [...cityCount.entries()]
      .map(([city, count]) => ({ city, count }))
      .sort((a, b) => b.count - a.count || a.city.localeCompare(b.city, "tr")),
    activities: [...activityCount.entries()]
      .map(([activity, count]) => ({ activity, count }))
      .sort((a, b) => b.count - a.count),
    categories: [...catCount.entries()]
      .map(([id, count]) => ({ id, name: nameById.get(id) ?? id, count }))
      .filter((c) => c.name !== c.id)
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "tr")),
  };
}
