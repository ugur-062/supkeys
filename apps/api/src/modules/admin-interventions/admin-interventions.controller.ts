import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import { AdminJwtAuthGuard } from "../admin-auth/guards/admin-jwt-auth.guard";
import { AdminInterventionsService } from "./admin-interventions.service";
import { AdminCancelDto } from "./dto/cancel.dto";
import {
  AdminSetOrderStatusDto,
  AdminSetPaymentStatusDto,
} from "./dto/order-status.dto";

interface AdminAuthRequest extends Request {
  user?: { sub: string; type: string };
}

@Controller("admin")
@UseGuards(AdminJwtAuthGuard)
export class AdminInterventionsController {
  constructor(private readonly service: AdminInterventionsService) {}

  @Get("tenders/:id")
  getTender(@Param("id") id: string): Promise<unknown> {
    return this.service.getTenderDetail(id);
  }

  @Get("orders/:id")
  getOrder(@Param("id") id: string): Promise<unknown> {
    return this.service.getOrderDetail(id);
  }

  @Post("tenders/:id/cancel")
  cancelTender(
    @Param("id") id: string,
    @Body() dto: AdminCancelDto,
    @Req() req: AdminAuthRequest,
  ): Promise<unknown> {
    return this.service.cancelTender(id, dto.reason, req.user?.sub ?? "");
  }

  @Post("orders/:id/cancel")
  cancelOrder(
    @Param("id") id: string,
    @Body() dto: AdminCancelDto,
    @Req() req: AdminAuthRequest,
  ): Promise<unknown> {
    return this.service.cancelOrder(id, dto.reason, req.user?.sub ?? "");
  }

  @Patch("orders/:id/status")
  setOrderStatus(
    @Param("id") id: string,
    @Body() dto: AdminSetOrderStatusDto,
    @Req() req: AdminAuthRequest,
  ): Promise<unknown> {
    return this.service.setOrderStatus(
      id,
      dto.status,
      dto.reason,
      req.user?.sub ?? "",
    );
  }

  @Patch("orders/:id/payments/:paymentId")
  setPaymentStatus(
    @Param("id") id: string,
    @Param("paymentId") paymentId: string,
    @Body() dto: AdminSetPaymentStatusDto,
    @Req() req: AdminAuthRequest,
  ): Promise<unknown> {
    return this.service.setPaymentStatus(
      id,
      paymentId,
      dto.status,
      dto.reason,
      req.user?.sub ?? "",
    );
  }
}
