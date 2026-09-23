import { Controller, Get, Post, UseGuards } from "@nestjs/common";
import { RequireAdminRole } from "../admin-auth/decorators/require-admin-role.decorator";
import { AdminJwtAuthGuard } from "../admin-auth/guards/admin-jwt-auth.guard";
import { AdminRolesGuard } from "../admin-auth/guards/admin-roles.guard";
import { publicProductWhere } from "../../common/company/public-profile-gate";
import { marketplaceListingWhere } from "../../common/company/listing-visibility";
import { ContentTranslationService } from "./content-translation.service";

/**
 * Yönetici ucu — geriye dönük doldurma ve durum. Yayın anında çeviri
 * otomatik; burası yalnız mevcut kayıtlar (ilk açılış) ve gözetim için.
 * Render'da kabuk yok: betik yerine uç (SUPER_ADMIN).
 */
@Controller("admin/content-translations")
@UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
export class ContentTranslationController {
  constructor(private readonly translations: ContentTranslationService) {}

  @Get("status")
  @RequireAdminRole("SUPER_ADMIN", "SUPPORT")
  status() {
    return this.translations.stats();
  }

  /** Herkese açık tüm ürün/talep/profilleri kuyruğa alır ve arka planda çevirir. */
  @Post("backfill")
  @RequireAdminRole("SUPER_ADMIN")
  async backfill() {
    const enqueued = await this.translations.enqueueAllPublic({
      products: publicProductWhere(),
      listings: { ...marketplaceListingWhere(new Date()), status: "OPEN" },
      companies: { publicEnabled: true, isActive: true, isBlocked: false, slug: { not: null } },
    });
    this.translations.sweepAll();
    return { enqueued, enabled: this.translations.enabled };
  }
}
