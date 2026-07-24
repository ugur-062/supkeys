import { Body, Controller, Post, UseGuards } from "@nestjs/common";
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
} from "class-validator";
import {
  CurrentCompanyUser,
  type AuthenticatedCompanyUser,
} from "../../company-auth/decorators/current-company-user.decorator";
import { CompanyJwtAuthGuard } from "../../company-auth/guards/company-jwt-auth.guard";
import { CompanyPaidTierGuard } from "../../company-auth/guards/company-paid-tier.guard";
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

  @IsIn(["ALIM", "SATIS"])
  listingType!: "ALIM" | "SATIS";
}

class TenderRefineDto {
  @IsObject() draft!: Record<string, unknown>;
  @IsString() @MaxLength(2000) message!: string;
}

/**
 * Faz AI-1 — belge → ihale formu. Guard zinciri AI-0 kullanım ekranıyla aynı
 * (JWT + Silver+); SA/ST koltuk kapısı serviste (assertAiAccess — tek kapı).
 * AI form doldurur, ihale AÇMAZ — oluşturma normal POST /company/listings
 * akışından geçer.
 */
@Controller("company/ai")
@UseGuards(CompanyJwtAuthGuard, CompanyPaidTierGuard)
export class TenderExtractController {
  constructor(private readonly service: TenderExtractService) {}

  @Post("uploads/url")
  uploadUrl(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Body() dto: AiUploadUrlDto,
  ) {
    return this.service.uploadUrl(user, dto);
  }

  @Post("tender-extract")
  extract(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Body() dto: TenderExtractDto,
  ) {
    return this.service.extract(user, dto);
  }

  @Post("tender-refine")
  refine(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Body() dto: TenderRefineDto,
  ) {
    return this.service.refine(user, dto);
  }
}
