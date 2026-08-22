import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsString, MaxLength } from "class-validator";
import {
  CurrentCompanyUser,
  type AuthenticatedCompanyUser,
} from "../../company-auth/decorators/current-company-user.decorator";
import { CompanyJwtAuthGuard } from "../../company-auth/guards/company-jwt-auth.guard";
import { CompanyPaidTierGuard } from "../../company-auth/guards/company-paid-tier.guard";
import { BidPriceExtractService } from "./bid-price-extract.service";

class BidPriceExtractDto {
  @IsString() @MaxLength(64) listingId!: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50) @IsString({ each: true }) fileKeys!: string[];
}

/**
 * "Belgeden Fiyatla (AI)" — guard zinciri tender-extract ile aynı (JWT + Silver+);
 * dosyalar `POST company/ai/uploads/url` presign'ıyla yüklenir (aynı anahtar alanı).
 * Yalnız ÖNİZLEME döner; teklif gönderme placeBid'den.
 */
@Controller("company/ai")
@UseGuards(CompanyJwtAuthGuard, CompanyPaidTierGuard)
export class BidPriceExtractController {
  constructor(private readonly service: BidPriceExtractService) {}

  @Post("bid-price-extract")
  extract(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Body() dto: BidPriceExtractDto,
  ) {
    return this.service.extract(user, dto);
  }
}
