import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import {
  CurrentCompanyUser,
  type AuthenticatedCompanyUser,
} from "../../company-auth/decorators/current-company-user.decorator";
import { CompanyJwtAuthGuard } from "../../company-auth/guards/company-jwt-auth.guard";
import {
  AcceptOrderDto,
  OrderNoteDto,
  ProposeRevisionDto,
  ShipOrderDto,
} from "../dto/order-action.dto";
import {
  OrderReasonDto,
  RecordPaymentDto,
  RejectPaymentReasonDto,
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
    @Body() dto: AcceptOrderDto,
  ) {
    return this.service.accept(user, id, dto);
  }

  @Post(":id/reject")
  reject(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
    @Body() dto: OrderReasonDto,
  ) {
    return this.service.reject(user, id, dto.reason);
  }

  // ---- Teslimat akışı ----

  @Post(":id/ship")
  ship(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
    @Body() dto: ShipOrderDto,
  ) {
    return this.service.ship(user, id, dto);
  }

  @Post(":id/receive")
  receive(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
    @Body() dto: OrderNoteDto,
  ) {
    return this.service.receive(user, id, dto);
  }

  @Post(":id/complete")
  complete(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
    @Body() dto: OrderNoteDto,
  ) {
    return this.service.complete(user, id, dto);
  }

  @Post(":id/cancel")
  cancel(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
    @Body() dto: OrderReasonDto,
  ) {
    return this.service.cancel(user, id, dto.reason);
  }

  // ---- A1: Satıcı iptal talebi + DISPUTED (yalnız ACCEPTED) ----

  @Post(":id/cancel-request")
  requestCancel(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
    @Body() dto: OrderReasonDto,
  ) {
    return this.service.requestCancel(user, id, dto.reason);
  }

  @Post(":id/cancel-request/withdraw")
  withdrawCancelRequest(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
  ) {
    return this.service.withdrawCancelRequest(user, id);
  }

  @Post(":id/cancel-request/approve")
  approveCancelRequest(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
  ) {
    return this.service.approveCancelRequest(user, id);
  }

  @Post(":id/cancel-request/reject")
  rejectCancelRequest(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
    @Body() dto: OrderNoteDto,
  ) {
    return this.service.rejectCancelRequest(user, id, dto.note);
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
    @Body() dto: RejectPaymentReasonDto,
  ) {
    return this.service.rejectPayment(user, id, paymentId, dto.reason);
  }

  // ---- Akreditif adımları (yalnız akreditifli sipariş) ----

  /** Alıcı: akreditif açıldı (LC belgesi yüklenmiş olmalı). */
  @Post(":id/lc/opened")
  lcOpened(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
  ) {
    return this.service.lcMarkOpened(user, id);
  }

  /** Satıcı: akreditifi kabul etti (gönderim kilidini açar). */
  @Post(":id/lc/accept")
  lcAccept(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
  ) {
    return this.service.lcMarkAccepted(user, id);
  }

  /** Satıcı: akreditif ödemesi bankadan alındı. */
  @Post(":id/lc/paid")
  lcPaid(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
  ) {
    return this.service.lcMarkPaid(user, id);
  }

  // ---- Revizyon müzakeresi (satıcı önerir, alıcı karar verir) ----

  /** Satıcı: revizyon öner (yeni kalemler + opsiyonel teslim tarihi/not). */
  @Post(":id/revisions")
  proposeRevision(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
    @Body() dto: ProposeRevisionDto,
  ) {
    return this.service.proposeRevision(user, id, dto);
  }

  /** Alıcı: revizyonu onayla (sipariş güncellenir). */
  @Post(":id/revisions/:revisionId/approve")
  approveRevision(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
    @Param("revisionId") revisionId: string,
  ) {
    return this.service.approveRevision(user, id, revisionId);
  }

  /** Alıcı: revizyonu reddet (gerekçeli). */
  @Post(":id/revisions/:revisionId/reject")
  rejectRevision(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
    @Param("revisionId") revisionId: string,
    @Body() dto: OrderReasonDto,
  ) {
    return this.service.rejectRevision(user, id, revisionId, dto.reason);
  }

  /** Satıcı: önerdiği revizyonu geri çek. */
  @Post(":id/revisions/:revisionId/cancel")
  cancelRevision(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
    @Param("revisionId") revisionId: string,
  ) {
    return this.service.cancelRevision(user, id, revisionId);
  }
}
