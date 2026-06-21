import {
  Body,
  Controller,
  Delete,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import {
  type AuthenticatedUser,
  CurrentUser,
} from "../../../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import {
  PermissionsGuard,
  RequirePermissions,
} from "../../auth/permissions/permissions.guard";
import { CreateOrderPaymentDto } from "../dto/create-order-payment.dto";
import { OrderPaymentsService } from "../services/order-payments.service";

/**
 * Faz 3 madde 16 — Alıcı tarafı direkt ödeme kayıtları.
 * Kayıtlar sipariş detayı ile birlikte döner; burası yalnızca yazma uçları.
 */
@Controller("tenants/me/orders/:orderId/payments")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TenantOrderPaymentsController {
  constructor(private readonly service: OrderPaymentsService) {}

  @Post()
  @RequirePermissions("order:edit")
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param("orderId") orderId: string,
    @Body() dto: CreateOrderPaymentDto,
  ): Promise<unknown> {
    return this.service.create(user.tenantId, user.id, orderId, dto);
  }

  @Delete(":paymentId")
  @RequirePermissions("order:edit")
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param("orderId") orderId: string,
    @Param("paymentId") paymentId: string,
  ): Promise<unknown> {
    return this.service.remove(user.tenantId, orderId, paymentId);
  }
}
