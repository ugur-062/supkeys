import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  CurrentUser,
  type AuthenticatedUser,
} from "../../../common/decorators/current-user.decorator";
import { Roles } from "../../../common/decorators/roles.decorator";
import { RolesGuard } from "../../../common/guards/roles.guard";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { BlockSupplierDto } from "../dto/block-supplier.dto";
import { ConnectBySupkeysIdDto } from "../dto/connect-by-supkeys-id.dto";
import { ListSuppliersDto } from "../dto/list-suppliers.dto";
import { TenantSuppliersService } from "../services/tenant-suppliers.service";

@Controller("tenants/me/suppliers")
@UseGuards(JwtAuthGuard, RolesGuard)
export class TenantSuppliersController {
  constructor(private readonly service: TenantSuppliersService) {}

  @Get()
  list(
    @Query() query: ListSuppliersDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.service.list(user.tenantId, query);
  }

  @Get("stats")
  stats(@CurrentUser() user: AuthenticatedUser): Promise<unknown> {
    return this.service.stats(user.tenantId);
  }

  // Tedarikçi Havuzu — premium tedarikçiler + bu alıcının bağlı tedarikçileri.
  @Get("pool")
  pool(
    @CurrentUser() user: AuthenticatedUser,
    @Query("search") search?: string,
    @Query("categoryId") categoryId?: string,
  ): Promise<unknown> {
    return this.service.pool(user.tenantId, { search, categoryId });
  }

  // Faz 3 madde 6 — Supkeys ID ile tedarikçi ekle (direkt ACTIVE).
  @Post("connect-by-supkeys-id")
  @HttpCode(HttpStatus.OK)
  connectBySupkeysId(
    @Body() dto: ConnectBySupkeysIdDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.service.connectBySupkeysId(user.tenantId, dto.supkeysId);
  }

  @Get(":id")
  findOne(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.service.findOne(user.tenantId, id);
  }

  @Post(":id/block")
  @Roles("COMPANY_ADMIN")
  @HttpCode(HttpStatus.OK)
  block(
    @Param("id") id: string,
    @Body() dto: BlockSupplierDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.service.block(user.tenantId, id, dto);
  }

  @Post(":id/unblock")
  @Roles("COMPANY_ADMIN")
  @HttpCode(HttpStatus.OK)
  unblock(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.service.unblock(user.tenantId, id);
  }
}
