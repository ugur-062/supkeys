import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { CompanyJwtAuthGuard } from "../company-auth/guards/company-jwt-auth.guard";
import { DirectoryQueryDto } from "./dto/directory-query.dto";
import { CompanyDirectoryService } from "./company-directory.service";

/**
 * Firma dizini — GİRİŞ GEREKTİRİR.
 *
 * Eskiden `public/companies/directory` altındaydı ve anonim ziyaretçiye
 * açıktı; ürün kararıyla giriş arkasına alındı. Web tarafı `/tedarikciler`
 * sayfasını çerezle çağırır; 401 alınca "kaydolun" ekranı gösterir.
 *
 * `Cache-Control` YOK ve olmamalı: yanıt oturuma bağlı bir kapıdan geçiyor,
 * paylaşımlı önbelleğe yazılırsa anonim ziyaretçiye servis edilebilirdi.
 */
@Controller("company/directory")
@UseGuards(CompanyJwtAuthGuard)
export class CompanyDirectoryController {
  constructor(private readonly service: CompanyDirectoryService) {}

  @Get()
  list(@Query() q: DirectoryQueryDto) {
    return this.service.listPublic(q);
  }

  @Get("facets")
  facets() {
    return this.service.directoryFacets();
  }
}
