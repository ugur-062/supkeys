import { i18nMessage } from "../../../common/i18n/http-i18n";
import { BadRequestException, Body, Controller, Get, HttpCode, Post, Query } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { IsString, MaxLength } from "class-validator";
import { CompanyConnectionsService } from "../services/company-connections.service";

/**
 * Faz C — dış davet opt-out (PUBLIC, guard'sız): davet e-postasındaki tek tık
 * link. GET olduğu için CSRF kapsamı dışında; token bilinmeden adres
 * işaretlenemez (enumeration yok — token cuid).
 */
@Controller("public/referral-optout")
export class ReferralOptOutController {
  constructor(private readonly service: CompanyConnectionsService) {}

  @Get()
  optOut(@Query("token") token?: string) {
    if (!token) throw new BadRequestException(i18nMessage("api.companyConnections.tokenGerekli"));
    return this.service.markReferralOptOut(token);
  }
}

export class ReferralVisitDto {
  @IsString()
  @MaxLength(100)
  token!: string;
}

/**
 * Davet bağlantısı AÇILDI (2026-09-27, Faz 0b) — kayıt sayfası `?ref=` ile
 * açılınca bildirir. İlgi sinyali: bağlantıyı açan adrese yeni davetler 7
 * günlük sıklık freni beklemeden gider. Yanıt her zaman aynı (jetonun geçerli
 * olup olmadığı sızdırılmaz); veri değiştirmesi yalnız zaman damgası.
 */
@Controller("public/referral-visit")
export class ReferralVisitController {
  constructor(private readonly service: CompanyConnectionsService) {}

  @Post()
  @HttpCode(204)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async visit(@Body() dto: ReferralVisitDto): Promise<void> {
    await this.service.markReferralVisited(dto.token);
  }
}
