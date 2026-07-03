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
import { InviteByEmailDto } from "../dto/invite-by-email.dto";
import { InviteConnectionDto } from "../dto/invite-connection.dto";
import { CompanyConnectionsService } from "../services/company-connections.service";

@Controller("company/connections")
@UseGuards(CompanyJwtAuthGuard, CompanyPermissionsGuard)
export class CompanyConnectionsController {
  constructor(private readonly service: CompanyConnectionsService) {}

  @Get()
  list(@CurrentCompanyUser() user: AuthenticatedCompanyUser) {
    return this.service.list(user.companyId);
  }

  @Get("self")
  self(@CurrentCompanyUser() user: AuthenticatedCompanyUser) {
    return this.service.getSelf(user);
  }

  @Get("referral-invites")
  referralInvites(@CurrentCompanyUser() user: AuthenticatedCompanyUser) {
    return this.service.listReferralInvites(user.companyId);
  }

  @Get("incoming")
  incoming(@CurrentCompanyUser() user: AuthenticatedCompanyUser) {
    return this.service.listIncoming(user.companyId);
  }

  /** Gönderdiğim bekleyen istekler — iptal için :id/disconnect kullanılır. */
  @Get("outgoing")
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
  discover(@CurrentCompanyUser() user: AuthenticatedCompanyUser) {
    return this.service.discover(user);
  }

  @Post("invite")
  @RequireCompanyPermission("connections:manage")
  invite(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Body() dto: InviteConnectionDto,
  ) {
    return this.service.invite(user, dto.supkeysId);
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
