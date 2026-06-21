import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import {
  AuthenticatedSupplierUser,
  CurrentSupplierUser,
} from "../../supplier-auth/decorators/current-supplier-user.decorator";
import { SupplierJwtAuthGuard } from "../../supplier-auth/guards/supplier-jwt-auth.guard";
import {
  CreateSupplierBankDto,
  UpdateSupplierBankDto,
} from "../dto/supplier-bank.dto";
import { SupplierBanksService } from "../services/supplier-banks.service";

// G6 madde 20 — Kayıtlı Bankalarım. GET: tüm kullanıcılar; yazma: yönetici.
@UseGuards(SupplierJwtAuthGuard)
@Controller("supplier-banks")
export class SupplierBanksController {
  constructor(private readonly service: SupplierBanksService) {}

  @Get()
  list(@CurrentSupplierUser() user: AuthenticatedSupplierUser) {
    return this.service.list(user.supplierId);
  }

  @Post()
  create(
    @CurrentSupplierUser() user: AuthenticatedSupplierUser,
    @Body() dto: CreateSupplierBankDto,
  ) {
    return this.service.create(user.supplierUserId, user.supplierId, dto);
  }

  @Patch(":id")
  update(
    @CurrentSupplierUser() user: AuthenticatedSupplierUser,
    @Param("id") id: string,
    @Body() dto: UpdateSupplierBankDto,
  ) {
    return this.service.update(user.supplierUserId, user.supplierId, id, dto);
  }

  @Delete(":id")
  remove(
    @CurrentSupplierUser() user: AuthenticatedSupplierUser,
    @Param("id") id: string,
  ) {
    return this.service.remove(user.supplierUserId, user.supplierId, id);
  }
}
