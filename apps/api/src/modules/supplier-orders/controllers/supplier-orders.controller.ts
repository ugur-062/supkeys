import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import {
  CurrentSupplierUser,
  type AuthenticatedSupplierUser,
} from "../../supplier-auth/decorators/current-supplier-user.decorator";
import { SupplierJwtAuthGuard } from "../../supplier-auth/guards/supplier-jwt-auth.guard";
import { ListOrdersDto } from "../dto/list-orders.dto";
import { SupplierOrdersService } from "../services/supplier-orders.service";

@Controller("supplier/orders")
@UseGuards(SupplierJwtAuthGuard)
export class SupplierOrdersController {
  constructor(private readonly service: SupplierOrdersService) {}

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
}
