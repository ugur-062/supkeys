import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import {
  CurrentCompanyUser,
  type AuthenticatedCompanyUser,
} from "../../company-auth/decorators/current-company-user.decorator";
import { RequireCompanyPermission } from "../../company-auth/decorators/require-company-permission.decorator";
import { CompanyPermissionsGuard } from "../../company-auth/guards/company-permissions.guard";
import { CompanyJwtAuthGuard } from "../../company-auth/guards/company-jwt-auth.guard";
import {
  AcceptOrderDto,
  OrderNoteDto,
  ShipOrderDto,
} from "../dto/order-action.dto";
import {
  OrderReasonDto,
  RecordPaymentDto,
  RejectPaymentReasonDto,
} from "../dto/order-payment.dto";
import { CompanyOrdersService } from "../services/company-orders.service";

@Controller("company/orders")
@UseGuards(CompanyJwtAuthGuard, CompanyPermissionsGuard)
export class CompanyOrdersController {
  constructor(private readonly service: CompanyOrdersService) {}

  @Get()
  @RequireCompanyPermission(["buy:view", "sell:view"])
  list(@CurrentCompanyUser() user: AuthenticatedCompanyUser) {
    return this.service.list(user);
  }

  @Get(":id")
  @RequireCompanyPermission(["buy:view", "sell:view"])
  getOne(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
  ) {
    return this.service.getOne(user, id);
  }

  // ---- Satıcı: sipariş kabul/ret ----

  @Post(":id/accept")
  @RequireCompanyPermission(["buy:order:manage", "sell:order:manage"])
  accept(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
    @Body() dto: AcceptOrderDto,
  ) {
    return this.service.accept(user, id, dto);
  }

  @Post(":id/reject")
  @RequireCompanyPermission(["buy:order:manage", "sell:order:manage"])
  reject(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
    @Body() dto: OrderReasonDto,
  ) {
    return this.service.reject(user, id, dto.reason);
  }

  // ---- Teslimat akışı ----

  @Post(":id/ship")
  @RequireCompanyPermission(["buy:order:manage", "sell:order:manage"])
  ship(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
    @Body() dto: ShipOrderDto,
  ) {
    return this.service.ship(user, id, dto);
  }

  @Post(":id/receive")
  @RequireCompanyPermission(["buy:order:manage", "sell:order:manage"])
  receive(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
    @Body() dto: OrderNoteDto,
  ) {
    return this.service.receive(user, id, dto);
  }

  @Post(":id/complete")
  @RequireCompanyPermission(["buy:order:manage", "sell:order:manage"])
  complete(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
    @Body() dto: OrderNoteDto,
  ) {
    return this.service.complete(user, id, dto);
  }

  @Post(":id/cancel")
  @RequireCompanyPermission(["buy:order:manage", "sell:order:manage"])
  cancel(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
    @Body() dto: OrderReasonDto,
  ) {
    return this.service.cancel(user, id, dto.reason);
  }

  // ---- A1: Satıcı iptal talebi + DISPUTED (yalnız ACCEPTED) ----

  @Post(":id/cancel-request")
  @RequireCompanyPermission(["buy:order:manage", "sell:order:manage"])
  requestCancel(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
    @Body() dto: OrderReasonDto,
  ) {
    return this.service.requestCancel(user, id, dto.reason);
  }

  @Post(":id/cancel-request/withdraw")
  @RequireCompanyPermission(["buy:order:manage", "sell:order:manage"])
  withdrawCancelRequest(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
  ) {
    return this.service.withdrawCancelRequest(user, id);
  }

  @Post(":id/cancel-request/approve")
  @RequireCompanyPermission(["buy:order:manage", "sell:order:manage"])
  approveCancelRequest(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
  ) {
    return this.service.approveCancelRequest(user, id);
  }

  @Post(":id/cancel-request/reject")
  @RequireCompanyPermission(["buy:order:manage", "sell:order:manage"])
  rejectCancelRequest(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
    @Body() dto: OrderNoteDto,
  ) {
    return this.service.rejectCancelRequest(user, id, dto.note);
  }

  // ---- TTK 23: Muayene/ayıp ihbarı (alıcı, teslimden sonra 8 gün) ----

  @Post(":id/defect-notice")
  @RequireCompanyPermission(["buy:order:manage", "sell:order:manage"])
  raiseDefectNotice(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
    @Body() dto: OrderReasonDto,
  ) {
    return this.service.raiseDefectNotice(user, id, dto.reason);
  }

  @Post(":id/defect-notice/withdraw")
  @RequireCompanyPermission(["buy:order:manage", "sell:order:manage"])
  withdrawDefectNotice(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
  ) {
    return this.service.withdrawDefectNotice(user, id);
  }

  // ---- Ödeme kayıtları ----

  @Post(":id/payments")
  @RequireCompanyPermission(["buy:order:manage", "sell:order:manage"])
  recordPayment(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
    @Body() dto: RecordPaymentDto,
  ) {
    return this.service.recordPayment(user, id, dto);
  }

  @Post(":id/payments/:paymentId/confirm")
  @RequireCompanyPermission(["buy:order:manage", "sell:order:manage"])
  confirmPayment(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
    @Param("paymentId") paymentId: string,
  ) {
    return this.service.confirmPayment(user, id, paymentId);
  }

  @Post(":id/payments/:paymentId/reject")
  @RequireCompanyPermission(["buy:order:manage", "sell:order:manage"])
  rejectPayment(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
    @Param("paymentId") paymentId: string,
    @Body() dto: RejectPaymentReasonDto,
  ) {
    return this.service.rejectPayment(user, id, paymentId, dto.reason);
  }

  // ---- Akreditif adımları (yalnız akreditifli sipariş) ----

  /** Alıcı: akreditif açıldı (LC belgesi yüklenmiş olmalı). */
  @Post(":id/lc/opened")
  @RequireCompanyPermission(["buy:order:manage", "sell:order:manage"])
  lcOpened(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
  ) {
    return this.service.lcMarkOpened(user, id);
  }

  /** Satıcı: akreditifi kabul etti (gönderim kilidini açar). */
  @Post(":id/lc/accept")
  @RequireCompanyPermission(["buy:order:manage", "sell:order:manage"])
  lcAccept(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
  ) {
    return this.service.lcMarkAccepted(user, id);
  }

  /** Satıcı: akreditif ödemesi bankadan alındı. */
  @Post(":id/lc/paid")
  @RequireCompanyPermission(["buy:order:manage", "sell:order:manage"])
  lcPaid(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
  ) {
    return this.service.lcMarkPaid(user, id);
  }

  // Revizyon müzakeresi KALDIRILDI (2026-08-02, kullanıcı kararı) — sipariş
  // değişikliği taraflar arası iletişim + gerekirse iptal/yeniden sipariş ile.
  // DB tabloları (order_revisions) veri kaybı olmasın diye duruyor.
}
