import {
  Controller,
  DefaultValuePipe,
  Get,
  ParseIntPipe,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  CurrentSupplierUser,
  type AuthenticatedSupplierUser,
} from "../../supplier-auth/decorators/current-supplier-user.decorator";
import { SupplierJwtAuthGuard } from "../../supplier-auth/guards/supplier-jwt-auth.guard";
import { SupplierDashboardService } from "../services/supplier-dashboard.service";

@Controller("supplier/dashboard")
@UseGuards(SupplierJwtAuthGuard)
export class SupplierDashboardController {
  constructor(private readonly service: SupplierDashboardService) {}

  @Get("stats")
  getStats(
    @CurrentSupplierUser() user: AuthenticatedSupplierUser,
  ): Promise<unknown> {
    return this.service.getStats(user.supplierId);
  }

  @Get("recent-activity")
  getRecentActivity(
    @CurrentSupplierUser() user: AuthenticatedSupplierUser,
    @Query("limit", new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ): Promise<unknown> {
    const safeLimit = Math.min(Math.max(limit, 1), 50);
    return this.service.getRecentActivity(user.supplierId, safeLimit);
  }
}
