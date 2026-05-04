import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  CurrentSupplierUser,
  type AuthenticatedSupplierUser,
} from "../../supplier-auth/decorators/current-supplier-user.decorator";
import { SupplierJwtAuthGuard } from "../../supplier-auth/guards/supplier-jwt-auth.guard";
import { CreateOrUpdateBidDto } from "../dto/bid.dto";
import { ListSupplierTendersDto } from "../dto/list-tenders.dto";
import { SupplierTendersService } from "../services/supplier-tenders.service";

@Controller("supplier/tenders")
@UseGuards(SupplierJwtAuthGuard)
export class SupplierTendersController {
  constructor(private readonly service: SupplierTendersService) {}

  // ---------- READ ----------

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

  // ---------- BID CRUD ----------

  @Get(":id/my-bid")
  getMyBid(
    @Param("id") id: string,
    @CurrentSupplierUser() user: AuthenticatedSupplierUser,
  ): Promise<unknown> {
    return this.service.getMyBid(user.supplierId, id);
  }

  @Post(":id/bid")
  createOrUpdateBid(
    @Param("id") id: string,
    @CurrentSupplierUser() user: AuthenticatedSupplierUser,
    @Body() dto: CreateOrUpdateBidDto,
  ): Promise<unknown> {
    return this.service.saveOrUpdateBid(
      user.supplierUserId,
      user.supplierId,
      id,
      dto,
    );
  }

  @Patch(":id/bid")
  updateBid(
    @Param("id") id: string,
    @CurrentSupplierUser() user: AuthenticatedSupplierUser,
    @Body() dto: CreateOrUpdateBidDto,
  ): Promise<unknown> {
    return this.service.saveOrUpdateBid(
      user.supplierUserId,
      user.supplierId,
      id,
      dto,
    );
  }

  @Post(":id/bid/submit")
  submitBid(
    @Param("id") id: string,
    @CurrentSupplierUser() user: AuthenticatedSupplierUser,
  ): Promise<unknown> {
    return this.service.submitBid(user.supplierId, id);
  }

  @Post(":id/bid/withdraw")
  withdrawBid(
    @Param("id") id: string,
    @CurrentSupplierUser() user: AuthenticatedSupplierUser,
  ): Promise<unknown> {
    return this.service.withdrawBid(user.supplierId, id);
  }
}
