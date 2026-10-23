import { i18nMessage } from "../../../common/i18n/http-i18n";
import { BadRequestException, Body, Controller, Get, HttpCode, Post, Query } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { IsString, MaxLength } from "class-validator";
import { CompanyConnectionsService } from "../services/company-connections.service";

export class ReferralOptOutDto {
  @IsString()
  @MaxLength(100)
  token!: string;
}

/**
 * Faz C — dış davet opt-out (PUBLIC, guard'sız): davet e-postasındaki
 * "davet almak istemiyorum" bağlantısı `/davet-kapat` sayfasına düşer.
 *
 * GET SALT OKUR, çıkış POST'la — düğmeyle (derin denetim MU-17; e-posta
 * tercihleri `public/email/unsubscribe` ile aynı desen). Eskiden GET yazıyordu
 * ve sayfa açılışta onu çağırıyordu: JS çalıştıran kurumsal güvenlik
 * tarayıcıları (Safe Links vb.) bağlantıyı açınca adres kimse istemeden tüm
 * davetlerden kalıcı düşüyordu. Kimlik çerezi taşımayan POST CSRF kapısından
 * muaf; token bilinmeden adres işaretlenemez (enumeration yok — token cuid).
 */
@Controller("public/referral-optout")
export class ReferralOptOutController {
  constructor(private readonly service: CompanyConnectionsService) {}

  @Get()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  describe(@Query("token") token?: string) {
    if (!token || token.length > 100) throw new BadRequestException(i18nMessage("api.companyConnections.tokenGerekli"));
    return this.service.describeReferralOptOut(token);
  }

  @Post()
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  optOut(@Body() dto: ReferralOptOutDto) {
    return this.service.markReferralOptOut(dto.token);
  }
}

export class ReferralVisitDto {
  @IsString()
  @MaxLength(100)
  token!: string;
}

/**
 * Davet bağlantısı AÇILDI (2026-09-27, Faz 0b/3) — kayıt ya da talep önizleme
 * sayfası `?ref=` ile açılınca bildirir. İlgi sinyali: bağlantıyı açan adrese
 * yeni davetler 7 günlük sıklık freni beklemeden gider. Yanıt: adresin kendi
 * firmasına ait önceden doldurma bilgisi (geçersiz jetonda boş alanlar).
 */
@Controller("public/referral-visit")
export class ReferralVisitController {
  constructor(private readonly service: CompanyConnectionsService) {}

  @Post()
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  visit(@Body() dto: ReferralVisitDto) {
    return this.service.markReferralVisited(dto.token);
  }
}

/**
 * Davet edilen firmanın KAYIT OLMADAN talebi görmesi (2026-09-27, Faz 3).
 * Jetonlu, guard'sız; içerik davet e-postasının beyaz listesi + tüm kalemler.
 */
@Controller("public/invite-preview")
export class InvitePreviewController {
  constructor(private readonly service: CompanyConnectionsService) {}

  @Get()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  preview(@Query("ref") ref?: string, @Query("l") listingId?: string) {
    if (!ref || ref.length > 100) throw new BadRequestException(i18nMessage("api.companyConnections.tokenGerekli"));
    return this.service.invitePreview(ref, listingId && listingId.length <= 40 ? listingId : undefined);
  }
}
