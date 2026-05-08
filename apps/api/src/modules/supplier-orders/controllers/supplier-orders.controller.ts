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
import { OrderPdfService } from "../../order-pdf/order-pdf.service";
import {
  CurrentSupplierUser,
  type AuthenticatedSupplierUser,
} from "../../supplier-auth/decorators/current-supplier-user.decorator";
import { SupplierJwtAuthGuard } from "../../supplier-auth/guards/supplier-jwt-auth.guard";
import { ListOrdersDto } from "../dto/list-orders.dto";
import { StartDeliveryDto } from "../dto/start-delivery.dto";
import { SupplierOrdersService } from "../services/supplier-orders.service";

@Controller("supplier/orders")
@UseGuards(SupplierJwtAuthGuard)
export class SupplierOrdersController {
  constructor(
    private readonly service: SupplierOrdersService,
    private readonly orderPdf: OrderPdfService,
  ) {}

  @Get()
  list(
    @Query() query: ListOrdersDto,
    @CurrentSupplierUser() user: AuthenticatedSupplierUser,
  ): Promise<unknown> {
    return this.service.list(user.supplierId, query);
  }

  @Get("stats")
  stats(
    @CurrentSupplierUser() user: AuthenticatedSupplierUser,
  ): Promise<unknown> {
    return this.service.stats(user.supplierId);
  }

  @Get(":id")
  findOne(
    @Param("id") id: string,
    @CurrentSupplierUser() user: AuthenticatedSupplierUser,
  ): Promise<unknown> {
    return this.service.findOne(user.supplierId, id);
  }

  @Post(":id/start-delivery")
  startDelivery(
    @Param("id") id: string,
    @Body() dto: StartDeliveryDto,
    @CurrentSupplierUser() user: AuthenticatedSupplierUser,
  ): Promise<unknown> {
    return this.service.startDelivery(
      user.supplierId,
      id,
      user.supplierUserId,
      dto,
    );
  }

  @Get(":id/pdf")
  async downloadPdf(
    @Param("id") id: string,
    @CurrentSupplierUser() user: AuthenticatedSupplierUser,
    @Res() res: Response,
  ): Promise<void> {
    const { buffer, filename } = await this.orderPdf.generateOrderPdf(id, {
      supplierId: user.supplierId,
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
