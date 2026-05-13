import { Global, Module } from "@nestjs/common";
import { PermissionsGuard } from "./permissions.guard";

/**
 * V2-6.5 — RBAC global modülü. PermissionsGuard her tenant controller'ında
 * @UseGuards(JwtAuthGuard, PermissionsGuard) ile kullanılabilsin diye `@Global`
 * + provider + export. PrismaService PrismaModule (global) üzerinden zaten erişilebilir.
 */
@Global()
@Module({
  providers: [PermissionsGuard],
  exports: [PermissionsGuard],
})
export class PermissionsModule {}
