import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from "@nestjs/common";
import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";
import type { Response } from "express";
import { DEFAULT_LOCALE } from "@rothern/i18n";
import { slugifyText } from "@rothern/shared";
import { tApi } from "../../../common/i18n/i18n.service";
import { RequireCompanyPermission } from "../../company-auth/decorators/require-company-permission.decorator";
import { CompanyPermissionsGuard } from "../../company-auth/guards/company-permissions.guard";
import { CompanyJwtAuthGuard } from "../../company-auth/guards/company-jwt-auth.guard";
import {
  ListingItemImportService,
  XLSX_MIME,
} from "./listing-item-import.service";

class TemplateQueryDto {
  /** Yalnız ALIM; parametre eski istemciler için kalır. */
  @IsOptional() @IsIn(["ALIM"]) listingType?: "ALIM";
}

class ParseItemImportDto {
  @IsString() @MaxLength(200) fileName!: string;
  @IsString() @MaxLength(100) mimeType!: string;
  /** ≤5MB dosya → ≤~7MB base64 (body parser 25MB). Boyut serviste doğrulanır. */
  @IsString() @MaxLength(7_500_000) dataBase64!: string;
  @IsOptional() @IsIn(["ALIM"]) listingType?: "ALIM";
}

/**
 * Kalem Excel içe aktarma — deterministik (AI yok), her pakete açık, YAZMAZ.
 * Ayrı prefix: `company/listings/:id` ile param çakışmasın.
 */
@Controller("company/listing-item-import")
@UseGuards(CompanyJwtAuthGuard, CompanyPermissionsGuard)
export class ListingItemImportController {
  constructor(private readonly service: ListingItemImportService) {}

  @Get("template")
  @RequireCompanyPermission("buy:listing:manage")
  async template(
    @Query() q: TemplateQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const buf = await this.service.buildTemplate();
    // Content-Disposition yalnız ASCII taşır (Kiril/Türkçe harf → ERR_INVALID_CHAR):
    // çevrilen ad slug'a indirgenir, Latin dışı ad boş kalırsa Türkçe yedek.
    const key = "api.companyListings.itemImport.template.fileName" as const;
    const name = `${slugifyText(tApi(key)) || slugifyText(tApi(key, undefined, DEFAULT_LOCALE))}.xlsx`;
    res.set({
      "Content-Type": XLSX_MIME,
      "Content-Disposition": `attachment; filename="${name}"`,
    });
    return new StreamableFile(buf);
  }

  @Post("parse")
  @RequireCompanyPermission("buy:listing:manage")
  parse(@Body() dto: ParseItemImportDto) {
    return this.service.parse(dto);
  }
}
