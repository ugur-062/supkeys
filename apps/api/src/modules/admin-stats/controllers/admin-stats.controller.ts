import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { AdminJwtAuthGuard } from "../../admin-auth/guards/admin-jwt-auth.guard";
import { AdminStatsService } from "../services/admin-stats.service";

@Controller("admin/stats")
@UseGuards(AdminJwtAuthGuard)
export class AdminStatsController {
  constructor(private readonly service: AdminStatsService) {}

  @Get("overview")
  getOverview(): Promise<unknown> {
    return this.service.getOverview();
  }

  @Get("recent-activity")
  getRecentActivity(@Query("limit") limit?: string): Promise<unknown> {
    const n = limit ? parseInt(limit, 10) : 10;
    return this.service.getRecentActivity(Number.isFinite(n) ? n : 10);
  }

  @Get("tender-trend")
  getTenderTrend(@Query("days") days?: string): Promise<unknown> {
    const n = days ? parseInt(days, 10) : 30;
    return this.service.getTenderTrend(Number.isFinite(n) ? n : 30);
  }
}
