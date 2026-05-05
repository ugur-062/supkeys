import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import {
  CurrentUser,
  type AuthenticatedUser,
} from "../../../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { ListOrdersDto } from "../dto/list-orders.dto";
import { TenantOrdersService } from "../services/tenant-orders.service";

@Controller("tenants/me/orders")
@UseGuards(JwtAuthGuard)
export class TenantOrdersController {
  constructor(private readonly service: TenantOrdersService) {}

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
}
