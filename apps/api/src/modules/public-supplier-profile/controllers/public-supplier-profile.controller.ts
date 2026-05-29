import { Controller, Get, Param } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { PublicSupplierProfileService } from "../services/public-supplier-profile.service";

/**
 * Public — JWT gerekmez. GET /api/public/suppliers/:slug
 *
 * Sadece membership=PREMIUM + publicEnabled=true + isActive + !isBlocked +
 * slug atanmış tedarikçi 200 döner; aksi 404.
 */
@Controller("public/suppliers")
export class PublicSupplierProfileController {
  constructor(private readonly service: PublicSupplierProfileService) {}

  /**
   * Aşırı kazıma/bot trafiğine karşı throttle: IP başına dakikada 30 istek.
   * Normal kullanıcı (sayfa açma) bunu zorlamaz; bot tarama eder.
   */
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get(":slug")
  getBySlug(@Param("slug") slug: string): Promise<unknown> {
    return this.service.getBySlug(slug);
  }

  /**
   * V2-SEO — Sitemap üretimi için tüm görünür slug'ları listeler.
   * Web tarafı `app/sitemap.ts` bunu fetch edip `MetadataRoute.Sitemap` üretir.
   * Throttle gevşek (saatte bir Google çekecek, manual fetch için 6 req/dk).
   */
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  @Get()
  listForSitemap(): Promise<unknown> {
    return this.service.listForSitemap();
  }
}
