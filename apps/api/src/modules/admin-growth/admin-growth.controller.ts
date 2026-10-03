import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { Type } from "class-transformer";
import { IsInt, IsOptional, Max, Min } from "class-validator";
import { RequireAdminRole } from "../admin-auth/decorators/require-admin-role.decorator";
import { AdminJwtAuthGuard } from "../admin-auth/guards/admin-jwt-auth.guard";
import { AdminRolesGuard } from "../admin-auth/guards/admin-roles.guard";
import { AdminGrowthService } from "./admin-growth.service";

export class GrowthReportDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  days?: number;
}

/** Büyüme ölçümü (Faz 4) — yalnız sayılar; satış ve yönetim görür. */
@Controller("admin/growth")
@UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
export class AdminGrowthController {
  constructor(private readonly service: AdminGrowthService) {}

  @Get("invites")
  @RequireAdminRole("SUPER_ADMIN", "SALES")
  invites(@Query() dto: GrowthReportDto) {
    return this.service.inviteReport(dto.days ?? 30);
  }
}
