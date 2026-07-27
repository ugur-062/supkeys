import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { IsOptional, IsString, MaxLength } from "class-validator";
import {
  CurrentCompanyUser,
  type AuthenticatedCompanyUser,
} from "../../company-auth/decorators/current-company-user.decorator";
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
@UseGuards(CompanyJwtAuthGuard)
export class ProfileEnrichController {
  constructor(private readonly service: ProfileEnrichService) {}

  @Post()
  enrich(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Body() dto: EnrichDto,
  ) {
    return this.service.enrich(user, dto);
  }
}
