import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import {
  CurrentCompanyUser,
  type AuthenticatedCompanyUser,
} from "../../company-auth/decorators/current-company-user.decorator";
import { CompanyJwtAuthGuard } from "../../company-auth/guards/company-jwt-auth.guard";
import {
  RecordPaymentDto,
  RejectReasonDto,
} from "../dto/order-payment.dto";
import { CompanyOrdersService } from "../services/company-orders.service";

@Controller("company/orders")
@UseGuards(CompanyJwtAuthGuard)
export class CompanyOrdersController {
  constructor(private readonly service: CompanyOrdersService) {}

  @Get()
  list(@CurrentCompanyUser() user: AuthenticatedCompanyUser) {
    return this.service.list(user.companyId);
  }

  @Get(":id")
  getOne(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
  ) {
    return this.service.getOne(user, id);
  }

  // ---- Satıcı: sipariş kabul/ret ----

  @Post(":id/accept")
  accept(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
  ) {
    return this.service.accept(user, id);
  }

  @Post(":id/reject")
  reject(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
    @Body() dto: RejectReasonDto,
  ) {
    return this.service.reject(user, id, dto.reason);
  }

  // ---- Teslimat akışı ----

  @Post(":id/ship")
  ship(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
  ) {
    return this.service.ship(user, id);
  }

  @Post(":id/receive")
  receive(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
  ) {
    return this.service.receive(user, id);
  }

  @Post(":id/complete")
  complete(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
  ) {
    return this.service.complete(user, id);
  }

  // ---- Ödeme kayıtları ----

  @Post(":id/payments")
  recordPayment(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
    @Body() dto: RecordPaymentDto,
  ) {
    return this.service.recordPayment(user, id, dto);
  }

  @Post(":id/payments/:paymentId/confirm")
  confirmPayment(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
    @Param("paymentId") paymentId: string,
  ) {
    return this.service.confirmPayment(user, id, paymentId);
  }

  @Post(":id/payments/:paymentId/reject")
  rejectPayment(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
    @Param("paymentId") paymentId: string,
    @Body() dto: RejectReasonDto,
  ) {
    return this.service.rejectPayment(user, id, paymentId, dto.reason);
  }
}
