import type { PrismaClient } from "@rothern/db";
import { PRODUCT_LIMITS, type TierName } from "@rothern/shared";

/**
 * KADEME DÜŞÜNCE yayında ürün tavanını uygula (denetim 2026-09-06 #3).
 *
 * Tavan yalnız `publish` anında kapı olsaydı, bir ay Silver alıp 500 ürün
 * yayımlayan firma paketi bitince 500 ürünle ücretsiz kalırdı. Bu yüzden
 * paketi biten (üyelik cron'u) ya da elle alınan (admin `setTier`) firmada en
 * iyi `limit` ürün yayında kalır — tamamlanma skoru, sonra yayın tarihi —
 * kalanı TASLAĞA çekilir: silinmez, slug korunur; Silver'a dönünce tek
 * tıkla yeniden yayımlanır. Arşivli-ama-public ürünler geri alınırken
 * `setActive` aynı tavanı ayrıca denetler.
 *
 * `null` limit (paketli kademe) → dokunulmaz.
 */
export async function enforceProductLimit(
  prisma: Pick<PrismaClient, "companyItem">,
  companyId: string,
  tier: string,
): Promise<{ unpublished: number; kept: number; limit: number | null }> {
  const limit = PRODUCT_LIMITS[tier as TierName] ?? null;
  if (limit == null) return { unpublished: 0, kept: 0, limit };
  const rows = await prisma.companyItem.findMany({
    where: { companyId, isActive: true, isPublic: true },
    select: { id: true },
    orderBy: [{ completionScore: "desc" }, { publishedAt: "desc" }, { id: "asc" }],
  });
  if (rows.length <= limit) return { unpublished: 0, kept: rows.length, limit };
  const drop = rows.slice(limit).map((r) => r.id);
  await prisma.companyItem.updateMany({
    where: { id: { in: drop } },
    data: { isPublic: false },
  });
  return { unpublished: drop.length, kept: limit, limit };
}
