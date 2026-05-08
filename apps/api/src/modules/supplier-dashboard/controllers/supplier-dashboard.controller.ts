import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ClampedIntPipe } from "../../../common/pipes/clamped-int.pipe";
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
    @Query("limit", new ClampedIntPipe({ min: 1, max: 50, default: 10 }))
    limit: number,
  ): Promise<unknown> {
    return this.service.getRecentActivity(user.supplierId, limit);
  }
}
