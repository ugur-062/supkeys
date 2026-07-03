import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { CompanyUsersService } from "./company-users.service";
import { AcceptCompanyInvitationDto } from "./dto/company-user.dto";

/**
 * PUBLIC davet uçları — kabul sayfası oturumsuz çalışır (kullanıcının henüz
 * hesabı yok). Token 64-hex, tek kullanımlık; brute-force'a karşı throttle.
 */
@Controller("company/invitations")
export class CompanyInvitationsController {
  constructor(private readonly service: CompanyUsersService) {}

  @Get(":token")
  @Throttle({ auth: { limit: 20, ttl: 60_000 } })
  preview(@Param("token") token: string) {
    return this.service.getInvitationByToken(token);
  }

  @Post(":token/accept")
  @Throttle({ auth: { limit: 5, ttl: 60_000 } })
  accept(
    @Param("token") token: string,
    @Body() dto: AcceptCompanyInvitationDto,
  ) {
    return this.service.acceptInvitation(token, dto);
  }
}
