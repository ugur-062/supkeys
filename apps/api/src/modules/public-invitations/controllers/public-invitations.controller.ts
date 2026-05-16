import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { AcceptInvitationDto } from "../dto/accept-invitation.dto";
import { PublicInvitationsService } from "../services/public-invitations.service";

/**
 * Public — JWT gerekmez. /api/invitations/:token endpoint'leri.
 *
 * accept davet aldığı kullanıcı için:
 *   1. GET /api/invitations/:token  → davet bilgisi (form pre-fill)
 *   2. POST /api/invitations/:token/accept  → user create + JWT döner (auto-login)
 */
@Controller("invitations")
export class PublicInvitationsController {
  constructor(private readonly service: PublicInvitationsService) {}

  @Get(":token")
  getByToken(@Param("token") token: string): Promise<unknown> {
    return this.service.getByToken(token);
  }

  // Security audit O-1 — token brute-force koruması: dakikada 5 deneme/IP
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post(":token/accept")
  accept(
    @Param("token") token: string,
    @Body() dto: AcceptInvitationDto,
  ): Promise<unknown> {
    return this.service.accept(token, dto);
  }
}
