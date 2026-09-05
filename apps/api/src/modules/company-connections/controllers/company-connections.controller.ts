import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import {
  CurrentCompanyUser,
  type AuthenticatedCompanyUser,
} from "../../company-auth/decorators/current-company-user.decorator";
import { RequireCompanyPermission } from "../../company-auth/decorators/require-company-permission.decorator";
import { Throttle } from "@nestjs/throttler";
import { CompanyJwtAuthGuard } from "../../company-auth/guards/company-jwt-auth.guard";
import { CompanyPermissionsGuard } from "../../company-auth/guards/company-permissions.guard";
import { ExternalTenderInviteDto,
  InviteByEmailBatchDto,
  InviteByEmailDto,
} from "../dto/invite-by-email.dto";
import { InviteConnectionDto } from "../dto/invite-connection.dto";
import { CompanyConnectionsService } from "../services/company-connections.service";

@Controller("company/connections")
@UseGuards(CompanyJwtAuthGuard, CompanyPermissionsGuard)
export class CompanyConnectionsController {
  constructor(private readonly service: CompanyConnectionsService) {}

  @Get()
  @RequireCompanyPermission(["connections:manage", "buy:view", "sell:view"])
  list(@CurrentCompanyUser() user: AuthenticatedCompanyUser) {
    return this.service.list(user.companyId);
  }

  @Get("self")
  @RequireCompanyPermission(["connections:manage", "buy:view", "sell:view"])
  self(@CurrentCompanyUser() user: AuthenticatedCompanyUser) {
    return this.service.getSelf(user);
  }

  @Get("referral-invites")
  @RequireCompanyPermission(["connections:manage", "buy:view", "sell:view"])
  referralInvites(@CurrentCompanyUser() user: AuthenticatedCompanyUser) {
    return this.service.listReferralInvites(user.companyId);
  }

  @Get("incoming")
  @RequireCompanyPermission(["connections:manage", "buy:view", "sell:view"])
  incoming(@CurrentCompanyUser() user: AuthenticatedCompanyUser) {
    return this.service.listIncoming(user.companyId);
  }

  /** Gönderdiğim bekleyen istekler — iptal için :id/disconnect kullanılır. */
  @Get("outgoing")
  @RequireCompanyPermission(["connections:manage", "buy:view", "sell:view"])
  outgoing(@CurrentCompanyUser() user: AuthenticatedCompanyUser) {
    return this.service.listOutgoing(user.companyId);
  }

  @Delete("referral-invites/:id")
  @RequireCompanyPermission("connections:manage")
  cancelReferralInvite(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
  ) {
    return this.service.cancelReferralInvite(user, id);
  }

  @Get("discover")
  @RequireCompanyPermission(["connections:manage", "buy:view", "sell:view"])
  discover(@CurrentCompanyUser() user: AuthenticatedCompanyUser) {
    return this.service.discover(user);
  }

  @Post("invite")
  @RequireCompanyPermission("connections:manage")
  invite(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Body() dto: InviteConnectionDto,
  ) {
    return this.service.invite(user, dto.rothernId);
  }

  /** Faz C — dış ihale daveti (limitli; frenler serviste). */
  @Post("external-tender-invite")
  @RequireCompanyPermission("buy:listing:manage")
  @Throttle({ auth: { limit: 3, ttl: 60_000 } })
  externalTenderInvite(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Body() dto: ExternalTenderInviteDto,
  ) {
    return this.service.inviteExternalForListing(user, dto.listingId, dto.emails);
  }

  @Post("invite-by-email")
  @RequireCompanyPermission("connections:manage")
  // Spam vektörü: dışa e-posta tetikler — dakikada 10 ile sınırlı.
  @Throttle({ auth: { limit: 10, ttl: 60_000 } })
  inviteByEmail(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Body() dto: InviteByEmailDto,
  ) {
    return this.service.inviteByEmail(user, dto.email);
  }

  /** Toplu e-posta daveti — 50'ye kadar; sonuç sınıflandırılmış döner. */
  @Post("invite-by-email/batch")
  @RequireCompanyPermission("connections:manage")
  // 50 dış e-posta tetikleyebilir — sıkı limit.
  @Throttle({ auth: { limit: 3, ttl: 60_000 } })
  inviteByEmailBatch(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Body() dto: InviteByEmailBatchDto,
  ) {
    return this.service.inviteByEmailBatch(user, dto.emails);
  }

  @Post(":id/accept")
  @RequireCompanyPermission("connections:manage")
  accept(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
  ) {
    return this.service.accept(user, id);
  }

  @Post(":id/reject")
  @RequireCompanyPermission("connections:manage")
  reject(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
  ) {
    return this.service.reject(user, id);
  }

  @Post(":id/disconnect")
  @RequireCompanyPermission("connections:manage")
  disconnect(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
  ) {
    return this.service.disconnect(user, id);
  }
}
