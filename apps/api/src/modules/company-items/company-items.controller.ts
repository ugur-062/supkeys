import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  MinLength,
  ArrayMaxSize,
} from "class-validator";
import { MAX_MONEY, UNITS } from "@rothern/shared";
import { Trim } from "../../common/decorators/trim.decorator";
import { CurrentCompanyUser } from "../company-auth/decorators/current-company-user.decorator";
import { RequireCompanyPermission } from "../company-auth/decorators/require-company-permission.decorator";
import { CompanyJwtAuthGuard } from "../company-auth/guards/company-jwt-auth.guard";
import { CompanyPermissionsGuard } from "../company-auth/guards/company-permissions.guard";
import type { AuthenticatedCompanyUser } from "../company-auth/strategies/company-jwt.strategy";
import { CompanyItemsService } from "./company-items.service";

const UNIT_CODES = UNITS.map((u) => u.code);

class CatalogItemDto {
  @IsOptional() @Trim() @IsString() @MaxLength(50) code?: string;
  @Trim() @IsString() @MinLength(1) @MaxLength(200) name!: string;
  @IsOptional() @Trim() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @Trim() @IsString() @MaxLength(5000) specification?: string;
  @Trim() @IsString() @MinLength(1) @MaxLength(20) unit!: string;
  @IsOptional() @IsString() @IsIn(UNIT_CODES, { message: "Geçersiz ölçü birimi" })
  unitCode?: string;
  @IsOptional() @Trim() @IsString() @MaxLength(20) categoryId?: string;
  @IsOptional() @Trim() @IsString() @MaxLength(100) brand?: string;
  @IsOptional() @Trim() @IsString() @MaxLength(100) mpn?: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Max(MAX_MONEY)
  targetPrice?: number;
}

class SetActiveDto {
  @IsBoolean() isActive!: boolean;
}

class MarkUsedDto {
  @IsArray() @ArrayMaxSize(200) @IsString({ each: true }) ids!: string[];
}

/**
 * Kalem Kataloğu (Faz 2).
 *
 * `CompanyPaidTierGuard` KULLANILMIYOR — tedarikçi şablonları premium bir
 * özellik, ama kalem kataloğu ihale AÇMANIN temel ergonomisi. Paketsiz firma
 * zaten ihale açamıyor (tier kapısı orada); kataloğu ayrıca kapatmak yalnız
 * kullanıcıyı zorlaştırırdı.
 *
 * Okuma her role açık, yazma `templates:manage` ister — şablon modülleriyle
 * aynı kural (kullanıcı için tek bir zihinsel model).
 */
@Controller("company/items")
@UseGuards(CompanyJwtAuthGuard, CompanyPermissionsGuard)
export class CompanyItemsController {
  constructor(private readonly service: CompanyItemsService) {}

  @Get()
  list(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Query("q") q?: string,
    @Query("categoryId") categoryId?: string,
    @Query("take") take?: string,
    @Query("skip") skip?: string,
    @Query("archived") archived?: string,
  ) {
    return this.service.list(user.companyId, {
      q,
      categoryId,
      archived: archived === "1" || archived === "true",
      take: take ? Number.parseInt(take, 10) || undefined : undefined,
      skip: skip ? Number.parseInt(skip, 10) || undefined : undefined,
    });
  }

  @Post()
  @RequireCompanyPermission("templates:manage")
  create(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Body() dto: CatalogItemDto,
  ) {
    return this.service.create(user, dto);
  }

  @Patch(":id")
  @RequireCompanyPermission("templates:manage")
  update(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
    @Body() dto: CatalogItemDto,
  ) {
    return this.service.update(user, id, dto);
  }

  /** Silme YOK — arşivle/geri al. */
  @Patch(":id/active")
  @RequireCompanyPermission("templates:manage")
  setActive(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
    @Body() dto: SetActiveDto,
  ) {
    return this.service.setActive(user, id, dto.isActive);
  }

  /** Ters yön: bir ilanın kalemlerini kataloğa al. */
  @Post("import-from-listing/:listingId")
  @RequireCompanyPermission("templates:manage")
  importFromListing(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("listingId") listingId: string,
  ) {
    return this.service.importFromListing(user, listingId);
  }

  /** Katalogdan sihirbaza eklendi — "sık kullanılan" sıralamasını besler. */
  @Post("mark-used")
  markUsed(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Body() dto: MarkUsedDto,
  ) {
    return this.service.markUsed(user.companyId, dto.ids);
  }
}
