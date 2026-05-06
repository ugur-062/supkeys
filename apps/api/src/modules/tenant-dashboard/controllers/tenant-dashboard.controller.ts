import {
  Controller,
  DefaultValuePipe,
  Get,
  ParseIntPipe,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  CurrentUser,
  type AuthenticatedUser,
} from "../../../common/decorators/current-user.decorator";
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
    @Query("limit", new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ): Promise<unknown> {
    const safeLimit = Math.min(Math.max(limit, 1), 50);
    return this.service.getRecentActivity(user.tenantId, safeLimit);
  }
}
