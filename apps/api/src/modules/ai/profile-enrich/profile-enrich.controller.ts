import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { ArrayMaxSize, IsArray, IsOptional, IsString, MaxLength } from "class-validator";
import {
  COMPANY_PROFILE_LIMITS,
  COMPANY_SERVICE_MAX_LENGTH,
  COMPANY_SERVICES_MAX,
} from "@rothern/shared";
import {
  CurrentCompanyUser,
  type AuthenticatedCompanyUser,
} from "../../company-auth/decorators/current-company-user.decorator";
import { RequireCompanyPermission } from "../../company-auth/decorators/require-company-permission.decorator";
import { CompanyPermissionsGuard } from "../../company-auth/guards/company-permissions.guard";
import { CompanyJwtAuthGuard } from "../../company-auth/guards/company-jwt-auth.guard";
import { ProfileEnrichService } from "./profile-enrich.service";

/**
 * Gövde İSTEĞE BAĞLI: Profilim taslağındaki (henüz kaydedilmemiş olabilecek)
 * sektör ve hizmetler — tavanlar PATCH /company/profile DTO'suyla aynı
 * sabitlerden. Web sitesi adresi ALINMAZ (özellik web'e çıkmaz); eski istemcinin
 * yolladığı `website` alanı `forbidNonWhitelisted` ile 400 döner, AI çağrılmaz.
 */
export class ProfileDescriptionDto {
  @IsOptional()
  @IsString()
  @MaxLength(COMPANY_PROFILE_LIMITS.industry)
  industry?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(COMPANY_SERVICES_MAX)
  @IsString({ each: true })
  @MaxLength(COMPANY_SERVICE_MAX_LENGTH, { each: true })
  services?: string[];
}

/**
 * Profil tanıtımı önerisi — firmanın platformdaki verisinden (ürünler, sektör,
 * hizmetler, kategoriler) YALNIZ tanıtım taslağı yazar; web'e çıkmaz, kaydetmez.
 * Her pakete açık; adet ve günlük sınır serviste.
 */
@Controller("company/ai/profile-enrich")
@UseGuards(CompanyJwtAuthGuard, CompanyPermissionsGuard)
export class ProfileEnrichController {
  constructor(private readonly service: ProfileEnrichService) {}

  @Post()
  @RequireCompanyPermission("company:manage")
  enrich(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Body() dto: ProfileDescriptionDto,
  ) {
    return this.service.enrich(user, dto);
  }
}
