import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import {
  CurrentUser,
  type AuthenticatedUser,
} from "../../../common/decorators/current-user.decorator";
import { Roles } from "../../../common/decorators/roles.decorator";
import { RolesGuard } from "../../../common/guards/roles.guard";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { OrderPdfService } from "../../order-pdf/order-pdf.service";
import { CancelOrderDto } from "../dto/cancel-order.dto";
import { CompleteOrderDto } from "../dto/complete-order.dto";
import { ListOrdersDto } from "../dto/list-orders.dto";
import { TenantOrdersService } from "../services/tenant-orders.service";

@Controller("tenants/me/orders")
@UseGuards(JwtAuthGuard)
export class TenantOrdersController {
  constructor(
    private readonly service: TenantOrdersService,
    private readonly orderPdf: OrderPdfService,
  ) {}

  @Get()
  list(
    @Query() query: ListOrdersDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.service.list(user.tenantId, query);
  }

  @Get("stats")
  stats(@CurrentUser() user: AuthenticatedUser): Promise<unknown> {
    return this.service.stats(user.tenantId);
  }

  @Get(":id")
  findOne(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.service.findOne(user.tenantId, id);
  }

  @Post(":id/complete")
  @UseGuards(RolesGuard)
  @Roles("COMPANY_ADMIN", "BUYER")
  complete(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: CompleteOrderDto,
  ): Promise<unknown> {
    return this.service.completeOrder(user.tenantId, id, user.id, dto);
  }

  @Post(":id/cancel")
  @UseGuards(RolesGuard)
  @Roles("COMPANY_ADMIN", "BUYER")
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: CancelOrderDto,
  ): Promise<unknown> {
    return this.service.cancelOrder(user.tenantId, id, user.id, dto);
  }

  @Get(":id/pdf")
  async downloadPdf(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Res() res: Response,
  ): Promise<void> {
    const { buffer, filename } = await this.orderPdf.generateOrderPdf(id, {
      tenantId: user.tenantId,
    });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename}"`,
    );
    res.setHeader("Content-Length", buffer.length);
    res.end(buffer);
  }
}
