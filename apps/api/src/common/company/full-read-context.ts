import { hasCompanyPermission } from "../../modules/company-auth/permissions/company-permissions.constants";
import type { AuthenticatedCompanyUser } from "../../modules/company-auth/strategies/company-jwt.strategy";

/**
 * Faz O — okuma bağlamı TEK KAYNAK (2026-09-05: izin tabanlı).
 *
 * Firmanın ALIM tarafı verisini (kendi talepleri, gelen teklifler, alım
 * siparişleri) `buy:view`; SATIŞ tarafı verisini (verdiği teklifler, açık
 * talepler, satış siparişleri) `sell:view` taşıyanlar bütün olarak görür.
 * İkisini de taşımayan üye (yalnız onaylayıcı vb.) DAR bağlamdadır — yalnız
 * kendi onay adımına bağlı kaydı görür (assertOwnerReadContext /
 * assertOrderReadContext).
 */
export type ReadSide = "buy" | "sell";

export function hasReadContext(
  user: Pick<AuthenticatedCompanyUser, "isOwner" | "permissions" | "roles">,
  side: ReadSide,
): boolean {
  return hasCompanyPermission(user, side === "buy" ? "buy:view" : "sell:view");
}

/** Herhangi bir portalı görebiliyor mu (onaylayıcı-only için false). */
export function hasAnyReadContext(
  user: Pick<AuthenticatedCompanyUser, "isOwner" | "permissions" | "roles">,
): boolean {
  return hasReadContext(user, "buy") || hasReadContext(user, "sell");
}

export type { AuthenticatedCompanyUser };
