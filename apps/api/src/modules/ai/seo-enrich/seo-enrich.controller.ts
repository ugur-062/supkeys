import { ALL_SEAT_PERMISSIONS } from "@rothern/shared";
import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { ArrayMaxSize, IsArray, IsIn, IsOptional, IsString, MaxLength } from "class-validator";
import type { AiSeoEnrichKind } from "@rothern/shared";
import { CurrentCompanyUser, type AuthenticatedCompanyUser } from "../../company-auth/decorators/current-company-user.decorator";
import { RequireCompanyPermission } from "../../company-auth/decorators/require-company-permission.decorator";
import { CompanyPermissionsGuard } from "../../company-auth/guards/company-permissions.guard";
import { CompanyJwtAuthGuard } from "../../company-auth/guards/company-jwt-auth.guard";
import { CompanyPaidTierGuard } from "../../company-auth/guards/company-paid-tier.guard";
import { SEO_ENRICH_MAX_DESCRIPTION, SEO_ENRICH_MAX_FACTS, SeoEnrichService } from "./seo-enrich.service";

class SeoEnrichDto {
  @IsIn(["product", "company", "listing"]) kind!: AiSeoEnrichKind;
  @IsString() @MaxLength(200) name!: string;
  @IsOptional() @IsString() @MaxLength(SEO_ENRICH_MAX_DESCRIPTION) description?: string | null;
  @IsOptional() @IsString() @MaxLength(200) categoryName?: string | null;
  @IsOptional() @IsArray() @ArrayMaxSize(SEO_ENRICH_MAX_FACTS) @IsString({ each: true }) @MaxLength(200, { each: true }) facts?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) @MaxLength(40, { each: true }) keywords?: string[];
  @IsOptional() @IsString() @MaxLength(100) brand?: string | null;
  @IsOptional() @IsString() @MaxLength(100) city?: string | null;
  @IsOptional() @IsString() @MaxLength(100) industry?: string | null;
}

/**
 * `POST company/ai/seo-enrich` — açıklama/anahtar kelime TASLAĞI (Silver+;
 * koltuk rolü `assertAiAccess`). Yazma yok: kullanıcı formda uygular.
 */
@Controller("company/ai")
@UseGuards(CompanyJwtAuthGuard, CompanyPaidTierGuard, CompanyPermissionsGuard)
export class SeoEnrichController {
  constructor(private readonly service: SeoEnrichService) {}

  @Post("seo-enrich")
  @RequireCompanyPermission(ALL_SEAT_PERMISSIONS)
  enrich(@CurrentCompanyUser() user: AuthenticatedCompanyUser, @Body() dto: SeoEnrichDto) {
    return this.service.enrich(user, dto);
  }
}
