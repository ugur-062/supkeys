import { RequireTier } from "../../company-auth/decorators/require-tier.decorator";
import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from "class-validator";
import {
  CurrentCompanyUser,
  type AuthenticatedCompanyUser,
} from "../../company-auth/decorators/current-company-user.decorator";
import { RequireCompanyPermission } from "../../company-auth/decorators/require-company-permission.decorator";
import { CompanyPermissionsGuard } from "../../company-auth/guards/company-permissions.guard";
import { CompanyJwtAuthGuard } from "../../company-auth/guards/company-jwt-auth.guard";
import { CompanyPaidTierGuard } from "../../company-auth/guards/company-paid-tier.guard";
import { SupplierDiscoveryService } from "./supplier-discovery.service";

/**
 * Keşif girdisi (2026-09-27, Faz 1): kategori ARTIK ZORUNLU DEĞİL — talep
 * formunun kalemler bölümünde kategori seçilmeden kalem adlarıyla aranır.
 * İkisi de boşsa sonuç boş döner. Talepten açılışta (`listingId`) ülkeler
 * talepten okunur; formda `targetCountries` gelir (boş = tüm ülkeler).
 */
class DiscoveryDto {
  @IsIn(["ALIM"])
  type!: "ALIM";

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  categoryIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(15)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  itemNames?: string[];

  /** Kayıtlı talepten açılış — hedef ülkeler talepten okunur (firma kapsamlı). */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  listingId?: string;

  /** Yayın öncesi form — talebin görünürlük ülkeleri (boş = tüm ülkeler). */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(60)
  @Matches(/^[A-Z]{2}$/, { each: true })
  targetCountries?: string[];
}

class ExternalDiscoveryDto extends DiscoveryDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  region?: string;
}

/**
 * "AI ile daha fazla tedarikçiye eriş" — dizin keşfi. Silver+ (ihale açan
 * zaten Silver+); yalnız firmaların kendi ilan ettiği profil alanları okunur.
 */
@Controller("company/ai/supplier-discovery")
@RequireTier("GOLD")
@UseGuards(CompanyJwtAuthGuard, CompanyPaidTierGuard, CompanyPermissionsGuard)
export class SupplierDiscoveryController {
  constructor(private readonly service: SupplierDiscoveryService) {}

  @Post()
  @RequireCompanyPermission("buy:listing:manage")
  discover(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Body() dto: DiscoveryDto,
  ) {
    return this.service.discoverRegistered(user, dto);
  }

  /** Faz B — web araması (Google Search grounding, AI bütçesinden). */
  @Post("external")
  @RequireCompanyPermission("buy:listing:manage")
  discoverExternal(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Body() dto: ExternalDiscoveryDto,
  ) {
    return this.service.discoverExternal(user, dto);
  }
}
