import { SetMetadata } from "@nestjs/common";

export const COMPANY_PERMISSION_KEY = "company_permission";

/**
 * Statik izin gereksinimi. Dizi verilirse HERHANGİ BİRİ yeter (any-of) —
 * iki portalın da okuyabildiği uçlar için (`["buy:view", "sell:view"]`);
 * tarafa göre daraltma servis katmanında yapılır.
 *
 * Kullanım:
 *   @UseGuards(CompanyJwtAuthGuard, CompanyPermissionsGuard)
 *   @RequireCompanyPermission("users:manage")
 *
 * Drift nöbetçisi (`company-permission-drift.spec`): `company*` prefix'li her
 * handler ya bu dekoratörü taşır ya da gerekçeli allowlist'tedir.
 */
export const RequireCompanyPermission = (
  permission: string | readonly string[],
) => SetMetadata(COMPANY_PERMISSION_KEY, permission);
