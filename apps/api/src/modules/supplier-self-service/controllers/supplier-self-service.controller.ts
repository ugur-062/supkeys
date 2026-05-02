import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from "@nestjs/common";
import {
  CurrentSupplierUser,
  type AuthenticatedSupplierUser,
} from "../../supplier-auth/decorators/current-supplier-user.decorator";
import { SupplierJwtAuthGuard } from "../../supplier-auth/guards/supplier-jwt-auth.guard";
import { AcceptInvitationDto } from "../dto/accept-invitation.dto";
import { SupplierSelfServiceService } from "../services/supplier-self-service.service";

@Controller("supplier-self-service")
@UseGuards(SupplierJwtAuthGuard)
export class SupplierSelfServiceController {
  constructor(private readonly service: SupplierSelfServiceService) {}

  @Post("accept-invitation")
  @HttpCode(HttpStatus.OK)
  acceptInvitation(
    @Body() dto: AcceptInvitationDto,
    @CurrentSupplierUser() user: AuthenticatedSupplierUser,
  ) {
    return this.service.acceptInvitation(
      user.supplierUserId,
      user.supplierId,
      user.email,
      dto,
    );
  }
}
