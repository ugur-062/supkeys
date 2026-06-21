import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  CurrentSupplierUser,
  type AuthenticatedSupplierUser,
} from "../../supplier-auth/decorators/current-supplier-user.decorator";
import { SupplierJwtAuthGuard } from "../../supplier-auth/guards/supplier-jwt-auth.guard";
import { AcceptInvitationDto } from "../dto/accept-invitation.dto";
import {
  ConnectBySupkeysIdDto,
  ConnectToBuyerDto,
} from "../dto/connect-buyer.dto";
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

  // Faz 3 madde 6 — Alıcı havuzu (premium) + Supkeys ID ile bağlanma.

  @Get("buyer-pool")
  getBuyerPool(
    @CurrentSupplierUser() user: AuthenticatedSupplierUser,
    @Query("search") search?: string,
  ) {
    return this.service.getBuyerPool(user.supplierId, search);
  }

  @Post("buyer-pool/connect")
  @HttpCode(HttpStatus.OK)
  connectToBuyer(
    @Body() dto: ConnectToBuyerDto,
    @CurrentSupplierUser() user: AuthenticatedSupplierUser,
  ) {
    return this.service.requestConnectToBuyer(
      user.supplierId,
      user.supplierUserId,
      dto.tenantId,
    );
  }

  @Post("connect-by-supkeys-id")
  @HttpCode(HttpStatus.OK)
  connectBySupkeysId(
    @Body() dto: ConnectBySupkeysIdDto,
    @CurrentSupplierUser() user: AuthenticatedSupplierUser,
  ) {
    return this.service.connectToBuyerBySupkeysId(
      user.supplierId,
      user.supplierUserId,
      dto.supkeysId,
    );
  }
}
