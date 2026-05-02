import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  CurrentSupplierUser,
  type AuthenticatedSupplierUser,
} from "../../supplier-auth/decorators/current-supplier-user.decorator";
import { SupplierJwtAuthGuard } from "../../supplier-auth/guards/supplier-jwt-auth.guard";
import { ListSupplierTendersDto } from "../dto/list-tenders.dto";
import { SupplierTendersService } from "../services/supplier-tenders.service";

@Controller("supplier/tenders")
@UseGuards(SupplierJwtAuthGuard)
export class SupplierTendersController {
  constructor(private readonly service: SupplierTendersService) {}

  @Get()
  list(
    @Query() query: ListSupplierTendersDto,
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
