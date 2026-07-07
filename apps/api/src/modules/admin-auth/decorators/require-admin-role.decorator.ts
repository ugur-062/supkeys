import { SetMetadata } from "@nestjs/common";

export const ADMIN_ROLES_KEY = "admin_roles";

/**
 * Admin rol gereksinimi (fonksiyon-seviyesi yetkilendirme). AdminRole:
 * SUPER_ADMIN (her şey) · SALES (demo/tenant/doğrulama) · SUPPORT (salt-okuma).
 * Yalnız kimlik doğrulama (AdminJwtAuthGuard) yeterli değil — yıkıcı aksiyonlar
 * bununla rol bazında da kısıtlanır.
 *
 *   @UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
 *   @RequireAdminRole("SUPER_ADMIN")
 */
export const RequireAdminRole = (...roles: string[]) =>
  SetMetadata(ADMIN_ROLES_KEY, roles);
