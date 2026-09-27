import { Body, Controller, Get, HttpCode, Post, Query } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { IsBoolean, IsOptional, IsString, MaxLength } from "class-validator";
import { EmailUnsubscribeService } from "./email-unsubscribe.service";

export class EmailUnsubscribeDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  t?: string;

  /** İşlem dışı TÜM e-postalardan çık (sayfadaki geniş seçenek). */
  @IsOptional()
  @IsBoolean()
  all?: boolean;
}

/**
 * Herkese açık, guard'sız (e-postadaki bağlantı). Kimlik çerezi taşımayan
 * istek CSRF kapısından muaftır; jeton imzalıdır. RFC 8058 tek tık POST'u
 * web alan adındaki `/api/email/unsubscribe` karşılar ve buraya JSON iletir.
 */
@Controller("public/email/unsubscribe")
export class EmailUnsubscribeController {
  constructor(private readonly service: EmailUnsubscribeService) {}

  @Get()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  describe(@Query("t") t?: string) {
    return this.service.describe(t);
  }

  @Post()
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  unsubscribe(@Query("t") tQuery: string | undefined, @Body() body: EmailUnsubscribeDto) {
    return this.service.unsubscribe(body?.t ?? tQuery, body?.all === true);
  }
}
