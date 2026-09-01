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
import { CompanyJwtAuthGuard } from "../../company-auth/guards/company-jwt-auth.guard";
import {
  ListingItemImportService,
  XLSX_MIME,
} from "./listing-item-import.service";

class TemplateQueryDto {
  @IsIn(["ALIM", "SATIS"]) listingType!: "ALIM" | "SATIS";
  @IsOptional() @IsIn(["TOPLU", "KALEM"]) priceScope?: "TOPLU" | "KALEM";
}

class ParseItemImportDto {
  @IsString() @MaxLength(200) fileName!: string;
  @IsString() @MaxLength(100) mimeType!: string;
  /** ≤5MB dosya → ≤~7MB base64 (body parser 25MB). Boyut serviste doğrulanır. */
  @IsString() @MaxLength(7_500_000) dataBase64!: string;
  @IsIn(["ALIM", "SATIS"]) listingType!: "ALIM" | "SATIS";
  @IsOptional() @IsIn(["TOPLU", "KALEM"]) priceScope?: "TOPLU" | "KALEM";
}

/**
 * Kalem Excel içe aktarma — deterministik (AI yok), her pakete açık, YAZMAZ.
 * Ayrı prefix: `company/listings/:id` ile param çakışmasın.
 */
@Controller("company/listing-item-import")
@UseGuards(CompanyJwtAuthGuard)
export class ListingItemImportController {
  constructor(private readonly service: ListingItemImportService) {}

  @Get("template")
  async template(
    @Query() q: TemplateQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const buf = await this.service.buildTemplate(q);
    const name =
      q.listingType === "SATIS"
        ? "rothern-satis-kalem-sablonu.xlsx"
        : "rothern-satın alma talebi-kalem-sablonu.xlsx";
    res.set({
      "Content-Type": XLSX_MIME,
      "Content-Disposition": `attachment; filename="${name}"`,
    });
    return new StreamableFile(buf);
  }

  @Post("parse")
  parse(@Body() dto: ParseItemImportDto) {
    return this.service.parse(dto);
  }
}
