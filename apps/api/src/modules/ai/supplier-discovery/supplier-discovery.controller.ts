import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";
import {
  CurrentCompanyUser,
  type AuthenticatedCompanyUser,
} from "../../company-auth/decorators/current-company-user.decorator";
import { CompanyJwtAuthGuard } from "../../company-auth/guards/company-jwt-auth.guard";
import { CompanyPaidTierGuard } from "../../company-auth/guards/company-paid-tier.guard";
import { SupplierDiscoveryService } from "./supplier-discovery.service";

class DiscoveryDto {
  @IsIn(["ALIM", "SATIS"])
  type!: "ALIM" | "SATIS";

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @IsString({ each: true })
  categoryIds!: string[];
}

class ExternalDiscoveryDto extends DiscoveryDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(15)
  @IsString({ each: true })
  itemNames?: string[];

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
@UseGuards(CompanyJwtAuthGuard, CompanyPaidTierGuard)
export class SupplierDiscoveryController {
  constructor(private readonly service: SupplierDiscoveryService) {}

  @Post()
  discover(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Body() dto: DiscoveryDto,
  ) {
    return this.service.discoverRegistered(user, dto);
  }

  /** Faz B — web araması (Google Search grounding, AI bütçesinden). */
  @Post("external")
  discoverExternal(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Body() dto: ExternalDiscoveryDto,
  ) {
    return this.service.discoverExternal(user, dto);
  }
}
