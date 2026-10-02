import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import { CurrentCompanyUser } from "../company-auth/decorators/current-company-user.decorator";
import { CompanyJwtAuthGuard } from "../company-auth/guards/company-jwt-auth.guard";
import type { AuthenticatedCompanyUser } from "../company-auth/strategies/company-jwt.strategy";
import { PublicProfileService } from "./public-profile.service";

/**
 * ÜYE BELGE İNDİRME UCU (arayüz testi webA-03 yeniden doğrulama, T-18).
 *
 * Görünürlük tablosu belge indirmeyi "üye"ye verir: oturum yeter, paket ya da
 * satınalma izni İSTENMEZ (satış koltuğu ve görüntüleyici de üyedir). Panel
 * ürün ucu `buy:view` istediği için bu üyeler belgeye hiçbir yerden
 * ulaşamıyordu. Yanıt oturuma bağlı: `Cache-Control` yok, herkese açık
 * önbelleğe girmez.
 */
@Controller("company/market/documents")
@UseGuards(CompanyJwtAuthGuard)
export class MemberProductDocumentsController {
  constructor(private readonly service: PublicProfileService) {}

  @Get(":companySlug/:productSlug")
  documents(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("companySlug") companySlug: string,
    @Param("productSlug") productSlug: string,
  ) {
    return this.service.documentsForMember(user.companyId, companySlug, productSlug);
  }
}
