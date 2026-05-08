import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import {
  CurrentUser,
  type AuthenticatedUser,
} from "../../../common/decorators/current-user.decorator";
import { ClampedIntPipe } from "../../../common/pipes/clamped-int.pipe";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { TenantDashboardService } from "../services/tenant-dashboard.service";

@Controller("tenants/me/dashboard")
@UseGuards(JwtAuthGuard)
export class TenantDashboardController {
  constructor(private readonly service: TenantDashboardService) {}

  @Get("stats")
  getStats(@CurrentUser() user: AuthenticatedUser): Promise<unknown> {
    return this.service.getStats(user.tenantId);
  }

  @Get("recent-activity")
  getRecentActivity(
    @CurrentUser() user: AuthenticatedUser,
    @Query("limit", new ClampedIntPipe({ min: 1, max: 50, default: 10 }))
    limit: number,
  ): Promise<unknown> {
    return this.service.getRecentActivity(user.tenantId, limit);
  }
}
