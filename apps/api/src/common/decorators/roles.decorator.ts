import { SetMetadata } from "@nestjs/common";

export const ROLES_METADATA_KEY = "roles";

/**
 * Tenant kullanıcı rolü kısıtı için kullanılır.
 * UserRole enum string'leri: "COMPANY_ADMIN" | "BUYER" | "APPROVER".
 *
 * @example
 *   @UseGuards(JwtAuthGuard, RolesGuard)
 *   @Roles("COMPANY_ADMIN")
 */
export const Roles = (...roles: string[]) =>
  SetMetadata(ROLES_METADATA_KEY, roles);
