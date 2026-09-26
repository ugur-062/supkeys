import { i18nMessage } from "../../../common/i18n/http-i18n";
import { BadRequestException, Controller, Get, Query } from "@nestjs/common";
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
