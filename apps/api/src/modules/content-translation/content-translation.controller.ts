import { Controller, Get, Post, UseGuards } from "@nestjs/common";
import { RequireAdminRole } from "../admin-auth/decorators/require-admin-role.decorator";
import { AdminJwtAuthGuard } from "../admin-auth/guards/admin-jwt-auth.guard";
import { AdminRolesGuard } from "../admin-auth/guards/admin-roles.guard";
import {
  CurrentAdmin,
  type AuthenticatedAdmin,
} from "../../common/decorators/current-admin.decorator";
import { AuditService } from "../audit/audit.service";
import { publicProductWhere } from "../../common/company/public-profile-gate";
import { marketplaceListingWhere } from "../../common/company/listing-visibility";
import { ContentTranslationService } from "./content-translation.service";
import { CategoryTranslationService } from "./category-translation.service";

/** Audit eylemleri (admin Denetim Kaydı sözlüğü `apps/admin/src/lib/audit-actions.ts`). */
const TRANSLATION_BACKFILL_ACTION = "admin.system.translation_backfill";
const SEARCH_TEXT_REBUILT_ACTION = "admin.system.search_text_rebuilt";
const CATEGORY_TRANSLATION_BACKFILL_ACTION = "admin.system.category_translation_backfill";
const ATTRIBUTE_TRANSLATION_BACKFILL_ACTION = "admin.system.attribute_translation_backfill";

/**
 * Yönetici ucu — geriye dönük doldurma ve durum. Yayın anında çeviri
 * otomatik; burası yalnız mevcut kayıtlar (ilk açılış) ve gözetim için.
 * Render'da kabuk yok: betik yerine uç (SUPER_ADMIN).
 */
@Controller("admin/content-translations")
@UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
export class ContentTranslationController {
  constructor(
    private readonly translations: ContentTranslationService,
    private readonly categories: CategoryTranslationService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Bu uçlar ücretli AI çevirisini kuyruğa alır/başlatır → kim, ne zaman
   * tetikledi izi kalır (diğer admin mutasyonları gibi; derin denetim LU-17).
   */
  private logRun(
    admin: AuthenticatedAdmin,
    action: string,
    metadata: Record<string, unknown>,
  ) {
    return this.audit.log({
      action,
      actorType: "admin",
      actorId: admin.id,
      entityType: "system",
      entityId: "content-translations",
      metadata,
    });
  }

  @Get("status")
  @RequireAdminRole("SUPER_ADMIN", "SUPPORT")
  status() {
    return this.translations.stats();
  }

  /** Herkese açık tüm ürün/talep/profilleri kuyruğa alır ve arka planda çevirir. */
  @Post("backfill")
  @RequireAdminRole("SUPER_ADMIN")
  async backfill(@CurrentAdmin() admin: AuthenticatedAdmin) {
    const enqueued = await this.translations.enqueueAllPublic({
      products: publicProductWhere(),
      listings: { ...marketplaceListingWhere(new Date()), status: "OPEN" },
      companies: { publicEnabled: true, isActive: true, isBlocked: false, slug: { not: null } },
    });
    this.translations.sweepAll();
    await this.logRun(admin, TRANSLATION_BACKFILL_ACTION, {
      enqueued,
      enabled: this.translations.enabled,
    });
    return { enqueued, enabled: this.translations.enabled };
  }

  /** Çok dilli arama metnini mevcut çevirilerden yeniden kurar (model çağrısı yok). */
  @Post("search-text/rebuild")
  @RequireAdminRole("SUPER_ADMIN")
  async rebuildSearchText(@CurrentAdmin() admin: AuthenticatedAdmin) {
    const r = await this.translations.rebuildAllSearchTexts();
    await this.logRun(admin, SEARCH_TEXT_REBUILT_ACTION, { entities: r.entities });
    return r;
  }

  /** i18n Faz 4 — kategori adı EN/RU: sayaç + koşan işin ilerlemesi. */
  @Get("categories/status")
  @RequireAdminRole("SUPER_ADMIN", "SUPPORT")
  categoryStatus() {
    return this.categories.status();
  }

  /** Görünür segmentlerdeki çevirisiz kategori adlarını arka planda toplu çevirir (tek seferlik, staging). */
  @Post("categories/backfill")
  @RequireAdminRole("SUPER_ADMIN")
  async categoryBackfill(@CurrentAdmin() admin: AuthenticatedAdmin) {
    const r = this.categories.start(["en", "ru"]);
    await this.logRun(admin, CATEGORY_TRANSLATION_BACKFILL_ACTION, { ...r });
    return r;
  }

  /** i18n Faz 4b — nitelik etiketi/seçenek çevirisi sayaç + ilerleme. */
  @Get("categories/attributes/status")
  @RequireAdminRole("SUPER_ADMIN", "SUPPORT")
  attributeStatus() {
    return this.categories.attributeStatus();
  }

  @Post("categories/attributes/backfill")
  @RequireAdminRole("SUPER_ADMIN")
  async attributeBackfill(@CurrentAdmin() admin: AuthenticatedAdmin) {
    const r = this.categories.startAttributes();
    await this.logRun(admin, ATTRIBUTE_TRANSLATION_BACKFILL_ACTION, { ...r });
    return r;
  }
}
