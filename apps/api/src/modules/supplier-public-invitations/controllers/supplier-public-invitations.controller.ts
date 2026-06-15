import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { AcceptSupplierInvitationDto } from "../dto/accept-supplier-invitation.dto";
import { SupplierPublicInvitationsService } from "../services/supplier-public-invitations.service";

@Controller("supplier-invitations")
export class SupplierPublicInvitationsController {
  constructor(
    private readonly service: SupplierPublicInvitationsService,
  ) {}

  @Get(":token")
  getByToken(@Param("token") token: string) {
    return this.service.getByToken(token);
  }

  @Post(":token/accept")
  accept(
    @Param("token") token: string,
    @Body() dto: AcceptSupplierInvitationDto,
  ) {
    return this.service.accept(token, dto);
  }
}
