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

class InviteMembersDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(60)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  companyIds!: string[];
}

/**
 * Yayın sonrası AI tedarikçi keşfi (2026-09-27, Faz 1): talep sayfasındaki
 * bant ve yayın paneli DURUMU okur. Tur bulduğunu kendisi davet eder
 * (2026-10-08) — aday onaylama ucu (`POST …/invite`) KALDIRILDI. `invite-members`
 * elle açılan "AI ile tedarikçi bul" penceresinin ucudur. Talep açmak GOLD
 * olduğu için kapı da GOLD; yönetme izni talep yönetimiyle aynı.
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

  /**
   * AI'ın önerdiği ROTHERN ÜYELERİNİ doğrudan talebe davet (2026-09-28;
   * bağlantı şartı yok, günlük tavan e-posta davetleriyle ortak).
   */
  @Post("invite-members")
  @RequireCompanyPermission("buy:listing:manage")
  inviteMembers(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("listingId") listingId: string,
    @Body() dto: InviteMembersDto,
  ) {
    return this.service.inviteMembers(user, listingId, dto.companyIds);
  }

  @Post("dismiss")
  @RequireCompanyPermission("buy:listing:manage")
  dismiss(@CurrentCompanyUser() user: AuthenticatedCompanyUser, @Param("listingId") listingId: string) {
    return this.service.dismiss(user, listingId);
  }
}
