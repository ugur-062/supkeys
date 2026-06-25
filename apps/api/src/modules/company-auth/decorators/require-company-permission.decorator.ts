import { SetMetadata } from "@nestjs/common";

export const COMPANY_PERMISSION_KEY = "company_permission";

/**
 * Statik izin gereksinimi. Dinamik (gövdeye bağlı, örn. ilan tipine göre)
 * kontroller servis katmanında yapılır.
 *
 * Kullanım:
 *   @UseGuards(CompanyJwtAuthGuard, CompanyPermissionsGuard)
 *   @RequireCompanyPermission("users:manage")
 */
export const RequireCompanyPermission = (permission: string) =>
  SetMetadata(COMPANY_PERMISSION_KEY, permission);
