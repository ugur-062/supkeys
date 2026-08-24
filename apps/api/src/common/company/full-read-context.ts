import { CompanyRole } from "@rothern/db";
import type { AuthenticatedCompanyUser } from "../../modules/company-auth/strategies/company-jwt.strategy";

/**
 * Faz O — "geniş okuma bağlamı" TEK KAYNAK.
 *
 * Kurucu/Yönetici ve işlem rolleri (Satın Almacı/Satışçı) firmanın ticari
 * verisini bütün olarak görür; YALNIZ onaylayıcı (ONAYLAYICI) ya da hiç rolü
 * olmayan üye DAR bağlamdadır — yalnız kendi onay adımına bağlı kaydı görür.
 *
 * Aynı yordam listings (assertOwnerReadContext), sipariş (assertOrderReadContext)
 * ve teklif belgelerinde kopyalanmıştı; pano/analitik uçlarında ise hiç yoktu
 * (denetim 2026-08-23 Parça 4) — kopyalar buradan okur.
 */
const FULL_READ_ROLES: readonly CompanyRole[] = [
  CompanyRole.SAHIP,
  CompanyRole.YONETICI,
  CompanyRole.SATIN_ALMACI,
  CompanyRole.SATISCI,
];

export function hasFullReadContext(user: {
  isOwner?: boolean;
  roles: CompanyRole[];
}): boolean {
  return (
    !!user.isOwner || user.roles.some((r) => FULL_READ_ROLES.includes(r))
  );
}

export type { AuthenticatedCompanyUser };
