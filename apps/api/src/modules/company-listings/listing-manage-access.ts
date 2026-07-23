import type { ListingType } from "@rothern/db";
import { hasCompanyPermission } from "../company-auth/permissions/company-permissions.constants";
import type { AuthenticatedCompanyUser } from "../company-auth/strategies/company-jwt.strategy";

export const LISTING_MANAGE_DENY_MESSAGE =
  "Bu ilanı yönetme yetkiniz yok — yalnız ilanı açan operatör yönetebilir";

/**
 * İlan YÖNETİM kapısının SAF kuralı — TEK KAYNAK: assertListingManageRole
 * (13 aksiyon + award) ve ilan-belgeleri servisi buradan okur.
 *
 * İzin verilir ancak ve ancak:
 *  (a) ilanın tarafına göre buy|sell:listing:manage izni VAR, VE
 *  (b) ilanı bu kişi açmış (createdById === userId).
 * SAHİP İSTİSNASI YOK — Kurucu ihalede salt-gözlemcidir (ürün kararı,
 * 2026-07-23). Döner: null = izinli; aksi hâlde red nedeni.
 */
export function listingManageDenial(
  user: AuthenticatedCompanyUser,
  listing: { type: ListingType; createdById: string },
): { needed: string; reason: "missing_permission" | "not_creator" } | null {
  const needed =
    listing.type === "ALIM" ? "buy:listing:manage" : "sell:listing:manage";
  const hasPerm = hasCompanyPermission(
    user.roles,
    user.isOwner,
    needed,
    user.permissionsOverride,
  );
  if (!hasPerm) return { needed, reason: "missing_permission" };
  if (listing.createdById !== user.userId)
    return { needed, reason: "not_creator" };
  return null;
}
