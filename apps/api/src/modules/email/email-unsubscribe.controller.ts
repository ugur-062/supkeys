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
/**
 * Hız sınırı GENİŞ (yayın denetimi 2026-09-28): tek tık POST'u posta
 * sağlayıcısından web rotasına, oradan Vercel sunucusundan buraya gelir — API
 * istemci IP'si olarak Vercel'in çıkış adresini görür, bütün çıkışlar TEK
 * kovayı paylaşır. 30/dk'da toplu bir gönderimin ardından (ya da kasıtlı
 * selde) meşru çıkışlar 429 alıyordu; Gmail/Yahoo gönderici kuralı çıkışın
 * işlenmesini şart koşar. Kaba kuvvet riski yok: jeton AES-256-GCM, geçersiz
 * jeton yalnız şifre çözme maliyeti; geçerli jeton yalnız kendi adresini yazar.
 */
const UNSUBSCRIBE_THROTTLE = { default: { limit: 600, ttl: 60_000 } };

@Controller("public/email/unsubscribe")
export class EmailUnsubscribeController {
  constructor(private readonly service: EmailUnsubscribeService) {}

  @Get()
  @Throttle(UNSUBSCRIBE_THROTTLE)
  describe(@Query("t") t?: string) {
    return this.service.describe(t);
  }

  @Post()
  @HttpCode(200)
  @Throttle(UNSUBSCRIBE_THROTTLE)
  unsubscribe(@Query("t") tQuery: string | undefined, @Body() body: EmailUnsubscribeDto) {
    return this.service.unsubscribe(body?.t ?? tQuery, body?.all === true);
  }
}
