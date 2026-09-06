import type { PrismaClient } from "@rothern/db";
import { isCategoryCode, isCompanyActivity, looksLikeProse, PAID_TIER, profileCompleteness, tierAtLeast, tokenizeQuery, type TierName } from "@rothern/shared";
import { effectiveTier } from "./effective-tier";
import { PUBLIC_PROFILE_WHERE, publicProductWhere } from "./public-profile-gate";

type Db = Pick<PrismaClient, "company" | "category">;

export interface DirectoryParams {
  q?: string;
  city?: string;
  category?: string;
  activity?: string;
  verified?: boolean;
  hasProducts?: boolean;
  page?: number;
}

export const DIRECTORY_PAGE_SIZE = 24;

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
export async function buildDirectory(
  prisma: Db,
  q: DirectoryParams,
  opts: { excludeIds?: string[] } = {},
) {
  const pageSize = DIRECTORY_PAGE_SIZE;
  const page = Math.max(1, q.page ?? 1);
  const tokens = q.q ? tokenizeQuery(q.q) : [];
  const rows = await prisma.company.findMany({
    where: {
      ...PUBLIC_PROFILE_WHERE,
      ...(opts.excludeIds?.length ? { id: { notIn: opts.excludeIds } } : {}),
      ...(q.city ? { city: q.city } : {}),
      ...(q.activity && isCompanyActivity(q.activity) ? { activities: { has: q.activity } } : {}),
      ...(q.verified ? { companyVerificationStatus: "VERIFIED" } : {}),
      ...(q.category && isCategoryCode(q.category)
        ? {
            OR: [
              { buyerCategoryIds: { has: q.category } },
              { buyerSubCategoryIds: { has: q.category } },
              { sellerCategoryIds: { has: q.category } },
              { sellerSubCategoryIds: { has: q.category } },
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
      website: true,
      buyerCategoryIds: true,
      sellerCategoryIds: true,
      companyVerificationStatus: true,
      tier: true,
      membershipEndAt: true,
      updatedAt: true,
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
  const eligible = rows
    .filter((r) => {
      const productCount = r._count.items;
      if (q.hasProducts && productCount === 0) return false;
      if (productCount > 0) return true;
      return profileCompleteness({ ...r, aboutText: looksLikeProse(r.aboutText) ? r.aboutText : null }).pct >= 60;
    })
    // Kararlı sıralama: paketli önce; grup içinde sorgunun updatedAt sırası korunur.
    .sort((a, b) => paidRank(a) - paidRank(b));
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

/** Dizin süzgeç sayaçları — listelenme koşulundan geçen tüm kartlar üzerinden. */
export async function directoryFacets(prisma: Db, opts: { excludeIds?: string[] } = {}) {
  const first = await buildDirectory(prisma, { page: 1 }, opts);
  const pages = Math.min(Math.ceil(first.total / first.pageSize), 10);
  const rest = await Promise.all(
    Array.from({ length: Math.max(0, pages - 1) }, (_, i) => buildDirectory(prisma, { page: i + 2 }, opts)),
  );
  const rows = [...first.items, ...rest.flatMap((r) => r.items)];
  const cities = new Map<string, number>();
  const activities = new Map<string, number>();
  let verified = 0;
  let withProducts = 0;
  for (const r of rows) {
    const city = r.city?.trim();
    if (city) cities.set(city, (cities.get(city) ?? 0) + 1);
    for (const a of new Set(r.activities)) activities.set(a, (activities.get(a) ?? 0) + 1);
    if (r.verified) verified += 1;
    if (r.productCount > 0) withProducts += 1;
  }
  return {
    total: rows.length,
    verified,
    withProducts,
    cities: [...cities.entries()]
      .map(([city, count]) => ({ city, count }))
      .sort((a, b) => b.count - a.count || a.city.localeCompare(b.city, "tr")),
    activities: [...activities.entries()]
      .map(([activity, count]) => ({ activity, count }))
      .sort((a, b) => b.count - a.count),
  };
}
