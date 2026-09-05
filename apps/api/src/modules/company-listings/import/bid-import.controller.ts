import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Res,
  StreamableFile,
  UseGuards,
} from "@nestjs/common";
import { IsString, MaxLength } from "class-validator";
import type { Response } from "express";
import {
  CurrentCompanyUser,
  type AuthenticatedCompanyUser,
} from "../../company-auth/decorators/current-company-user.decorator";
import { RequireCompanyPermission } from "../../company-auth/decorators/require-company-permission.decorator";
import { CompanyPermissionsGuard } from "../../company-auth/guards/company-permissions.guard";
import { CompanyJwtAuthGuard } from "../../company-auth/guards/company-jwt-auth.guard";
import { BidImportService } from "./bid-import.service";
import { XLSX_MIME } from "./listing-item-import.service";

class ParseBidTemplateDto {
  @IsString() @MaxLength(200) fileName!: string;
  @IsString() @MaxLength(100) mimeType!: string;
  @IsString() @MaxLength(7_500_000) dataBase64!: string;
}

/**
 * Teklif şablonu (ihaleye özel) — AI yok, her pakete açık, YAZMAZ. Yetki ve
 * kalem görünürlüğü serviste `getOne` üzerinden (blok/görünürlük/teaser aynen).
 */
@Controller("company/listings/:id/bid-import")
@UseGuards(CompanyJwtAuthGuard, CompanyPermissionsGuard)
export class BidImportController {
  constructor(private readonly service: BidImportService) {}

  @Get("template")
  @RequireCompanyPermission("sell:bid:submit")
  async template(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { buffer, fileName } = await this.service.buildTemplate(user, id);
    res.set({
      "Content-Type": XLSX_MIME,
      "Content-Disposition": `attachment; filename="${encodeURIComponent(fileName)}"`,
    });
    return new StreamableFile(buffer);
  }

  @Post("parse")
  @RequireCompanyPermission("sell:bid:submit")
  parse(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
    @Body() dto: ParseBidTemplateDto,
  ) {
    return this.service.parseTemplate(user, id, dto);
  }
}
