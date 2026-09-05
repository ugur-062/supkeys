import { ALL_SEAT_PERMISSIONS } from "@rothern/shared";
import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from "class-validator";
import {
  CurrentCompanyUser,
  type AuthenticatedCompanyUser,
} from "../../company-auth/decorators/current-company-user.decorator";
import { RequireCompanyPermission } from "../../company-auth/decorators/require-company-permission.decorator";
import { CompanyPermissionsGuard } from "../../company-auth/guards/company-permissions.guard";
import { CompanyJwtAuthGuard } from "../../company-auth/guards/company-jwt-auth.guard";
import { CompanyPaidTierGuard } from "../../company-auth/guards/company-paid-tier.guard";
import { CategorySuggestService } from "./category-suggest.service";
import { TenderExtractService } from "./tender-extract.service";

class AiUploadUrlDto {
  @IsString() @MaxLength(200) fileName!: string;
  @IsString() @MaxLength(100) mimeType!: string;
  @IsOptional() @IsInt() fileSize?: number;
}

class TenderExtractDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsString({ each: true })
  fileKeys!: string[];

  @IsIn(["ALIM"])
  listingType!: "ALIM";
}

class TenderRefineDto {
  @IsObject() draft!: Record<string, unknown>;
  @IsString() @MaxLength(2000) message!: string;
}

class CategorySuggestItemDto {
  @IsString() @MaxLength(300) name!: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
}

class CategorySuggestDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CategorySuggestItemDto)
  items!: CategorySuggestItemDto[];
}

/**
 * Faz AI-1 — belge → ihale formu. Guard zinciri AI-0 kullanım ekranıyla aynı
 * (JWT + Silver+); SA/ST koltuk kapısı serviste (assertAiAccess — tek kapı).
 * AI form doldurur, ihale AÇMAZ — oluşturma normal POST /company/listings
 * akışından geçer.
 */
@Controller("company/ai")
@UseGuards(CompanyJwtAuthGuard, CompanyPaidTierGuard, CompanyPermissionsGuard)
export class TenderExtractController {
  constructor(
    private readonly service: TenderExtractService,
    private readonly categorySuggest: CategorySuggestService,
  ) {}

  /**
   * Wizard "kalemlerden otomatik kategori" — kullanıcının yazdığı kalem
   * adlarından ≤3 doğrulanmış L3 kategori önerir. Bağlayıcı değil; hata/bütçe
   * durumunda boş liste döner, form akışı bozulmaz.
   */
  @Post("tender-extract/category-suggest")
  @RequireCompanyPermission("buy:listing:manage")
  categorySuggestForItems(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Body() dto: CategorySuggestDto,
  ) {
    return this.categorySuggest.suggestForItems(user, dto.items);
  }

  @Post("uploads/url")
  @RequireCompanyPermission(ALL_SEAT_PERMISSIONS)
  uploadUrl(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Body() dto: AiUploadUrlDto,
  ) {
    return this.service.uploadUrl(user, dto);
  }

  @Post("tender-extract")
  @RequireCompanyPermission("buy:listing:manage")
  extract(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Body() dto: TenderExtractDto,
  ) {
    return this.service.extract(user, dto);
  }

  @Post("tender-refine")
  @RequireCompanyPermission("buy:listing:manage")
  refine(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Body() dto: TenderRefineDto,
  ) {
    return this.service.refine(user, dto);
  }
}
