import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { ClientIp } from "../../common/http/client-ip.decorator";
import { MarketplaceLiveGuard } from "../../common/http/marketplace-live.guard";
import { CreateInquiryDto } from "./dto/create-inquiry.dto";
import { PublicInquiryService } from "./public-inquiry.service";

/**
 * MİSAFİR BİLGİ TALEBİ — auth GEREKTİRMEZ.
 *
 * Sitedeki TEK anonim YAZMA ucu. Bu yüzden üç katman birden var:
 *   · sıkı hız limiti (IP başına, throttler),
 *   · gövde içinde bot tuzağı + asgari doldurma süresi (DTO),
 *   · ve asıl kapı: DOĞRULAMA — talep, ziyaretçi e-postasını onaylayana
 *     kadar satıcıya İLETİLMEZ.
 *
 * Pazar yeri anahtarına tabi: pazar yeri kapalıyken ürün sayfası zaten yok,
 * uç de olmamalı.
 */
@Controller("public/inquiries")
@UseGuards(MarketplaceLiveGuard)
export class PublicInquiryController {
  constructor(private readonly service: PublicInquiryService) {}

  /**
   * Talep oluştur. Yanıt HER ZAMAN aynı: e-postanın kayıtlı olup olmadığını,
   * limite takılıp takılmadığını (bot tuzağı hariç) sızdırmaz.
   */
  @Post()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  create(@Body() dto: CreateInquiryDto, @ClientIp() ip: string) {
    return this.service.create({
      companySlug: dto.companySlug,
      productSlug: dto.productSlug,
      name: dto.name,
      email: dto.email,
      companyName: dto.companyName,
      phone: dto.phone,
      message: dto.message,
      quantity: dto.quantity,
      honeypot: dto.website,
      elapsedMs: dto.elapsedMs,
      ip,
    });
  }

  /** E-posta doğrulama — talebi satıcıya İLETEN adım. */
  @Get("verify")
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  verify(@Query("t") token: string) {
    return this.service.verify(token ?? "");
  }
}
