import { Module } from "@nestjs/common";
import { CategoriesModule } from "../categories/categories.module";
import { PublicTenantProfileController } from "./controllers/public-tenant-profile.controller";
import { TenantPublicProfileController } from "./controllers/tenant-public-profile.controller";
import { TenantPublicProfileService } from "./services/tenant-public-profile.service";

/**
 * Faz 1 — Alıcı public profili: herkese açık /firma/[slug] + tenant editörü.
 */
@Module({
  imports: [CategoriesModule],
  controllers: [PublicTenantProfileController, TenantPublicProfileController],
  providers: [TenantPublicProfileService],
})
export class TenantPublicProfileModule {}
