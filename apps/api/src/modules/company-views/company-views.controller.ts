import { Body, Controller, Get, Headers, HttpCode, Post, Query, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";
import { ClientIp } from "../../common/http/client-ip.decorator";
import {
  CurrentCompanyUser,
  type AuthenticatedCompanyUser,
} from "../company-auth/decorators/current-company-user.decorator";
import { CompanyJwtAuthGuard } from "../company-auth/guards/company-jwt-auth.guard";
import { CompanyViewsService } from "./company-views.service";

/** Ziyaret Edenler + İş Analizi (panel). */
@Controller("company/views")
@UseGuards(CompanyJwtAuthGuard)
export class CompanyViewsController {
  constructor(private readonly service: CompanyViewsService) {}

  @Get("visitors")
  visitors(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Query("days") days?: string,
    @Query("page") page?: string,
  ) {
    return this.service.visitors(user, { days: Number(days) || undefined, page: Number(page) || undefined });
  }

  @Get("insights")
  insights(@CurrentCompanyUser() user: AuthenticatedCompanyUser, @Query("days") days?: string) {
    return this.service.insights(user, { days: Number(days) || undefined });
  }
}

class PublicViewDto {
  @IsIn(["profile", "product"]) type!: "profile" | "product";
  @IsString() @MaxLength(120) companySlug!: string;
  @IsOptional() @IsString() @MaxLength(160) productSlug?: string;
}

/**
 * Herkese açık sayfa beacon'ı. Kimlik YOK (çerezsiz istek; giriş yapmış üye
 * de burada anonimdir — kimliği panel görüntülemesinde). Pazar yeri
 * anahtarına TABİ DEĞİL: firma profili/ürün sayfası anahtardan bağımsız
 * yayında. IP başına dakikada 60.
 */
@Controller("public/views")
@Throttle({ default: { limit: 60, ttl: 60_000 } })
export class PublicViewsController {
  constructor(private readonly service: CompanyViewsService) {}

  @Post()
  @HttpCode(204)
  async record(
    @Body() dto: PublicViewDto,
    @ClientIp() ip: string,
    @Headers("user-agent") userAgent?: string,
  ): Promise<void> {
    await this.service.recordPublicView({
      type: dto.type,
      companySlug: dto.companySlug,
      productSlug: dto.productSlug ?? null,
      ip: ip ?? "",
      userAgent: userAgent ?? "",
    });
  }
}
