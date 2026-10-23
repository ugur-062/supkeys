import { Body, Controller, Get, Put, UseGuards } from "@nestjs/common";
import { CurrentCompanyUser, type AuthenticatedCompanyUser } from "../company-auth/decorators/current-company-user.decorator";
import { RequireCompanyPermission } from "../company-auth/decorators/require-company-permission.decorator";
import { CompanyJwtAuthGuard } from "../company-auth/guards/company-jwt-auth.guard";
import { CompanyPermissionsGuard } from "../company-auth/guards/company-permissions.guard";
import { CompanyPaidTierGuard } from "../company-auth/guards/company-paid-tier.guard";
import { RequireTier } from "../company-auth/decorators/require-tier.decorator";
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
  // Talep şartları satınalma paneli ayarı (Gold) — UI Gold duvarı çiziyordu,
  // API ise Gold'dan düşen firmada kaydediyordu (arayüz testi T3, T-06).
  // Okuma (GET) kademesiz: düşen firma mevcut şartlarını görür.
  @RequireTier("GOLD")
  @UseGuards(CompanyPaidTierGuard)
  save(@CurrentCompanyUser() user: AuthenticatedCompanyUser, @Body() body: unknown) {
    return this.service.save(user, body);
  }
}
