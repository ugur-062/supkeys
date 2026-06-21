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
  AuthenticatedSupplierUser,
  CurrentSupplierUser,
} from "../../supplier-auth/decorators/current-supplier-user.decorator";
import { SupplierJwtAuthGuard } from "../../supplier-auth/guards/supplier-jwt-auth.guard";
import { SupplierManagerGuard } from "../../supplier-auth/guards/supplier-manager.guard";
import { InviteTeamMemberDto } from "../dto/invite-team-member.dto";
import { SupplierTeamService } from "../services/supplier-team.service";

@UseGuards(SupplierJwtAuthGuard)
@Controller("supplier-account/team")
export class SupplierTeamController {
  constructor(private readonly service: SupplierTeamService) {}

  @Get()
  listTeam(@CurrentSupplierUser() user: AuthenticatedSupplierUser) {
    return this.service.listTeam(user.supplierId, user.supplierUserId);
  }

  @Get("invitations")
  listInvitations(@CurrentSupplierUser() user: AuthenticatedSupplierUser) {
    return this.service.listInvitations(user.supplierId);
  }

  @Post("invite")
  @UseGuards(SupplierManagerGuard)
  invite(
    @CurrentSupplierUser() user: AuthenticatedSupplierUser,
    @Body() dto: InviteTeamMemberDto,
  ) {
    return this.service.invite(user.supplierId, user.supplierUserId, dto);
  }

  @Post("invitations/:id/resend")
  @UseGuards(SupplierManagerGuard)
  resend(
    @CurrentSupplierUser() user: AuthenticatedSupplierUser,
    @Param("id") id: string,
  ) {
    return this.service.resendInvitation(user.supplierId, id);
  }

  @Delete("invitations/:id")
  @UseGuards(SupplierManagerGuard)
  revoke(
    @CurrentSupplierUser() user: AuthenticatedSupplierUser,
    @Param("id") id: string,
  ) {
    return this.service.revokeInvitation(user.supplierId, id);
  }

  @Delete(":id")
  @UseGuards(SupplierManagerGuard)
  removeMember(
    @CurrentSupplierUser() user: AuthenticatedSupplierUser,
    @Param("id") id: string,
  ) {
    return this.service.removeMember(user.supplierId, user.supplierUserId, id);
  }
}
