import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { IsOptional, IsString, MaxLength } from "class-validator";
import {
  CurrentCompanyUser,
  type AuthenticatedCompanyUser,
} from "../../company-auth/decorators/current-company-user.decorator";
import { RequireCompanyPermission } from "../../company-auth/decorators/require-company-permission.decorator";
import { CompanyPermissionsGuard } from "../../company-auth/guards/company-permissions.guard";
import { CompanyJwtAuthGuard } from "../../company-auth/guards/company-jwt-auth.guard";
import { ProfileEnrichService } from "./profile-enrich.service";

class EnrichDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  website?: string;
}

/** Rothern profilini web sitesinden AI ile oluştur — BRONZ+ (kapı serviste). */
@Controller("company/ai/profile-enrich")
@UseGuards(CompanyJwtAuthGuard, CompanyPermissionsGuard)
export class ProfileEnrichController {
  constructor(private readonly service: ProfileEnrichService) {}

  @Post()
  @RequireCompanyPermission("company:manage")
  enrich(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Body() dto: EnrichDto,
  ) {
    return this.service.enrich(user, dto);
  }
}
