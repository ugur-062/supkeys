import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import { CurrentCompanyUser } from "../company-auth/decorators/current-company-user.decorator";
import { RequireCompanyPermission } from "../company-auth/decorators/require-company-permission.decorator";
import { CompanyJwtAuthGuard } from "../company-auth/guards/company-jwt-auth.guard";
import { CompanyPermissionsGuard } from "../company-auth/guards/company-permissions.guard";
import type { AuthenticatedCompanyUser } from "../company-auth/strategies/company-jwt.strategy";
import { PublicProfileService } from "./public-profile.service";

/**
 * PANEL ürün sayfası ilişkili blokları (arayüz testi D-231).
 *
 * Panel eskiden herkese açık `public/companies/:slug/products/:p/related`
 * ucunu okuyordu: o uç görüntüleyeni bilmez (ve paylaşımlı önbellekte
 * yaşar), "Benzer ürünler — diğer tedarikçilerden" bloğu üyenin KENDİ
 * ürününü ve engel ilişkili firmaların ürünlerini gösteriyordu. Bu uç aynı
 * fonksiyonu görüntüleyen kapsamıyla çağırır.
 *
 * İzin panel ürün sayfasıyla AYNI (`buy:view`, `discoverProduct`).
 * `Cache-Control` YOK: yanıt oturuma bağlı.
 */
@Controller("company/market/related")
@UseGuards(CompanyJwtAuthGuard, CompanyPermissionsGuard)
export class PanelRelatedProductsController {
  constructor(private readonly service: PublicProfileService) {}

  @Get(":companySlug/:productSlug")
  @RequireCompanyPermission("buy:view")
  related(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("companySlug") companySlug: string,
    @Param("productSlug") productSlug: string,
  ) {
    return this.service.relatedForViewer(user.companyId, companySlug, productSlug);
  }
}
