import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsString, MaxLength } from "class-validator";
import { RequireTier } from "../../company-auth/decorators/require-tier.decorator";
import {
  CurrentCompanyUser,
  type AuthenticatedCompanyUser,
} from "../../company-auth/decorators/current-company-user.decorator";
import { RequireCompanyPermission } from "../../company-auth/decorators/require-company-permission.decorator";
import { CompanyPermissionsGuard } from "../../company-auth/guards/company-permissions.guard";
import { CompanyJwtAuthGuard } from "../../company-auth/guards/company-jwt-auth.guard";
import { CompanyPaidTierGuard } from "../../company-auth/guards/company-paid-tier.guard";
import { DiscoveryRunsService } from "./discovery-runs.service";

class InviteCandidatesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(60)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  candidateIds!: string[];
}

/**
 * Yayın sonrası AI tedarikçi önerileri (2026-09-27, Faz 1): talep sayfasındaki
 * bant ve yayın paneli okur; alıcı seçtiklerini tek tıkla davet eder. Talep
 * açmak GOLD olduğu için kapı da GOLD; yönetme izni talep yönetimiyle aynı.
 */
@Controller("company/ai/supplier-discovery/listings/:listingId")
@RequireTier("GOLD")
@UseGuards(CompanyJwtAuthGuard, CompanyPaidTierGuard, CompanyPermissionsGuard)
export class DiscoveryRunsController {
  constructor(private readonly service: DiscoveryRunsService) {}

  @Get()
  @RequireCompanyPermission("buy:listing:manage")
  list(@CurrentCompanyUser() user: AuthenticatedCompanyUser, @Param("listingId") listingId: string) {
    return this.service.forListing(user, listingId);
  }

  @Post("invite")
  @RequireCompanyPermission("buy:listing:manage")
  invite(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("listingId") listingId: string,
    @Body() dto: InviteCandidatesDto,
  ) {
    return this.service.invite(user, listingId, dto.candidateIds);
  }

  @Post("dismiss")
  @RequireCompanyPermission("buy:listing:manage")
  dismiss(@CurrentCompanyUser() user: AuthenticatedCompanyUser, @Param("listingId") listingId: string) {
    return this.service.dismiss(user, listingId);
  }
}
