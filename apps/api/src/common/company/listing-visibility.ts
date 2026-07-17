import { Prisma } from "@rothern/db";

/**
 * İlan görünürlük kuralı — TEK KAYNAK (X5/X7 drift önleme). Bir izleyici bir
 * firmanın açık ihalesini ANCAK VE ANCAK şu durumda görür:
 *   - PUBLIC       → herkes
 *   - CONNECTIONS  → yalnız o firmayla AKTİF bağlı olan
 *   - PRIVATE      → yalnız o ilana DAVETLİ olan
 * Davet HER görünürlüğü açar (davetli, görünürlükten bağımsız görür). "Bağlı
 * olmak" ≠ "davetli olmak": bağlı firma PRIVATE (davet-only) ihaleyi GÖRMEZ.
 *
 * İki temsil, tek kural (drift'i önlemek için birlikte yaşarlar):
 *  - `isListingVisibleToViewer` — tekil (zaten çekilmiş) ilan → boolean (getOne).
 *  - `visibleOwnerListingWhere` — TEK firmanın ihaleleri üzerinde findMany → Prisma
 *    `where` fragment (getProfile).
 * (sellerTenders çok-firma + ülke-kapsamı bileşik varyantıdır; davet orada da
 * ülke/görünürlüğü aşar — aynı çekirdek kural.)
 */
export function isListingVisibleToViewer(
  visibility: string,
  opts: { isInvited: boolean; connectedToOwner: boolean },
): boolean {
  return (
    opts.isInvited ||
    visibility === "PUBLIC" ||
    (visibility === "CONNECTIONS" && opts.connectedToOwner)
  );
}

export function visibleOwnerListingWhere(
  viewerCompanyId: string,
  connectedToOwner: boolean,
): Prisma.ListingWhereInput {
  return {
    OR: [
      { visibility: "PUBLIC" },
      ...(connectedToOwner
        ? [{ visibility: "CONNECTIONS" as const }]
        : []),
      // Davet → görünürlükten bağımsız (PRIVATE dahil) görür.
      { invitations: { some: { invitedCompanyId: viewerCompanyId } } },
    ],
  };
}
