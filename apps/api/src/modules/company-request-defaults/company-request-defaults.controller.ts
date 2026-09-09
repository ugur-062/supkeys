import { Body, Controller, Get, Put, UseGuards } from "@nestjs/common";
import { CurrentCompanyUser, type AuthenticatedCompanyUser } from "../company-auth/decorators/current-company-user.decorator";
import { RequireCompanyPermission } from "../company-auth/decorators/require-company-permission.decorator";
import { CompanyJwtAuthGuard } from "../company-auth/guards/company-jwt-auth.guard";
import { CompanyPermissionsGuard } from "../company-auth/guards/company-permissions.guard";
import { CompanyRequestDefaultsService } from "./company-request-defaults.service";

/**
 * `GET/PUT company/request-defaults` — talep şartları (ticari profil).
 * Gövde zod ile serviste doğrulanır (Prisma enum'ları); DTO sınıfı yok —
 * `forbidNonWhitelisted` boş sınıfla her alanı reddederdi, bu yüzden ham
 * gövde alınır ve şema son sözü söyler.
 */
@Controller("company/request-defaults")
@UseGuards(CompanyJwtAuthGuard, CompanyPermissionsGuard)
export class CompanyRequestDefaultsController {
  constructor(private readonly service: CompanyRequestDefaultsService) {}

  @Get()
  @RequireCompanyPermission("buy:view")
  get(@CurrentCompanyUser() user: AuthenticatedCompanyUser) {
    return this.service.get(user.companyId);
  }

  @Put()
  @RequireCompanyPermission("buy:listing:manage")
  save(@CurrentCompanyUser() user: AuthenticatedCompanyUser, @Body() body: unknown) {
    return this.service.save(user, body);
  }
}
