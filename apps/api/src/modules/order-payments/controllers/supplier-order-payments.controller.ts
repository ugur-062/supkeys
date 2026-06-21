import { Body, Controller, Param, Post, UseGuards } from "@nestjs/common";
import {
  type AuthenticatedSupplierUser,
  CurrentSupplierUser,
} from "../../supplier-auth/decorators/current-supplier-user.decorator";
import { SupplierJwtAuthGuard } from "../../supplier-auth/guards/supplier-jwt-auth.guard";
import { RejectOrderPaymentDto } from "../dto/reject-order-payment.dto";
import { OrderPaymentsService } from "../services/order-payments.service";

/**
 * Faz 3 madde 16 — Tedarikçi tarafı: alıcının kaydettiği ödemeyi onayla/reddet.
 * Kayıtlar sipariş detayı ile birlikte döner; burası yalnızca yazma uçları.
 */
@UseGuards(SupplierJwtAuthGuard)
@Controller("supplier/orders/:orderId/payments")
export class SupplierOrderPaymentsController {
  constructor(private readonly service: OrderPaymentsService) {}

  @Post(":paymentId/confirm")
  confirm(
    @CurrentSupplierUser() user: AuthenticatedSupplierUser,
    @Param("orderId") orderId: string,
    @Param("paymentId") paymentId: string,
  ): Promise<unknown> {
    return this.service.confirm(
      user.supplierId,
      user.supplierUserId,
      orderId,
      paymentId,
    );
  }

  @Post(":paymentId/reject")
  reject(
    @CurrentSupplierUser() user: AuthenticatedSupplierUser,
    @Param("orderId") orderId: string,
    @Param("paymentId") paymentId: string,
    @Body() dto: RejectOrderPaymentDto,
  ): Promise<unknown> {
    return this.service.reject(
      user.supplierId,
      user.supplierUserId,
      orderId,
      paymentId,
      dto.reason,
    );
  }
}
