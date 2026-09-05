import {
  Body,
  Controller,
  Get,
  Post,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import {
  ArrayMaxSize,
  IsArray,
  IsString,
  MaxLength,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import { PRODUCT_IMPORT_MAX_ROWS } from "@rothern/shared";
import { Trim } from "../../common/decorators/trim.decorator";
import { CurrentCompanyUser } from "../company-auth/decorators/current-company-user.decorator";
import { RequireCompanyPermission } from "../company-auth/decorators/require-company-permission.decorator";
import { CompanyJwtAuthGuard } from "../company-auth/guards/company-jwt-auth.guard";
import { CompanyPermissionsGuard } from "../company-auth/guards/company-permissions.guard";
import type { AuthenticatedCompanyUser } from "../company-auth/strategies/company-jwt.strategy";
import { CompanyItemsService } from "./company-items.service";
import { ProductImportService, XLSX_MIME } from "./product-import.service";

class ParseDto {
  @Trim() @IsString() @MaxLength(255) fileName!: string;
  @Trim() @IsString() @MaxLength(120) mimeType!: string;
  /** base64 gövde — gövde ayrıştırıcı sınırı 5MB (CLAUDE.md md. 9). */
  @IsString() dataBase64!: string;
}

class ImportRowDto {
  @Trim() @IsString() @MaxLength(200) name!: string;
  @Trim() @IsString() @MaxLength(20) unit!: string;
  code?: string | null;
  description?: string | null;
  categoryId?: string | null;
  brand?: string | null;
  mpn?: string | null;
  keywords?: string[];
  priceMode?: "FIXED" | "TIERED" | "ON_REQUEST";
  price?: number | null;
  currency?: string | null;
  moq?: number | null;
}

class CommitDto {
  @IsArray()
  @ArrayMaxSize(PRODUCT_IMPORT_MAX_ROWS)
  @ValidateNested({ each: true })
  @Type(() => ImportRowDto)
  rows!: ImportRowDto[];
}

/**
 * Ürün toplu içe aktarma (Faz 4) — üç adım, hiçbiri diğerine güvenmez:
 *   1. `template`  → doldurulacak Excel
 *   2. `parse`     → ÖNİZLEME (hiçbir şey YAZILMAZ, satır-satır sorun listesi)
 *   3. `commit`    → kullanıcı onaylayınca yazılır
 *
 * `commit` istemciden gelen satırları YENİDEN doğrular (DTO): önizlemeyi
 * atlayıp doğrudan commit'e istek atan biri kuralları baypas edemesin.
 */
@Controller("company/items/import")
@UseGuards(CompanyJwtAuthGuard, CompanyPermissionsGuard)
export class ProductImportController {
  constructor(
    private readonly importer: ProductImportService,
    private readonly items: CompanyItemsService,
  ) {}

  @Get("template")
  @RequireCompanyPermission("sell:product:manage")
  async template(@Res() res: Response) {
    const buf = await this.importer.buildTemplate();
    res.setHeader("Content-Type", XLSX_MIME);
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="rothern-urun-sablonu.xlsx"',
    );
    res.send(buf);
  }

  @Post("parse")
  @RequireCompanyPermission("sell:product:manage")
  parse(@Body() dto: ParseDto) {
    return this.importer.parse(dto);
  }

  @Post("commit")
  @RequireCompanyPermission("sell:product:manage")
  commit(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Body() dto: CommitDto,
  ) {
    return this.items.importRows(user, dto.rows);
  }
}
