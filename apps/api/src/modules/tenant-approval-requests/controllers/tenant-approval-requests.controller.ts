import {
  Body,
  Controller,
  Get,
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
import {
  PermissionsGuard,
  RequirePermissions,
} from "../../auth/permissions/permissions.guard";
import { CancelRequestDto } from "../dto/cancel-request.dto";
import { DecideStepDto } from "../dto/decide-step.dto";
import { ListApprovalRequestsDto } from "../dto/list-approval-requests.dto";
import { ApprovalReminderService } from "../services/approval-reminder.service";
import { TenantApprovalRequestsService } from "../services/tenant-approval-requests.service";

@Controller("tenants/me/approval-requests")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TenantApprovalRequestsController {
  constructor(
    private readonly service: TenantApprovalRequestsService,
    private readonly reminders: ApprovalReminderService,
  ) {}

  @Get()
  @RequirePermissions("approval:view")
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListApprovalRequestsDto,
  ): Promise<unknown> {
    return this.service.list(user.tenantId, user.id, query);
  }

  @Get("pending-count")
  @RequirePermissions("approval:view")
  getPendingCount(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ count: number }> {
    return this.service.getPendingCount(user.tenantId, user.id);
  }

  /**
   * V1.5 Oturum 2 — Manuel reminder cron tetikleme. COMPANY_ADMIN-only.
   * Production'da cron her gün 09:00 İstanbul'da otomatik çalışır; bu endpoint
   * tüm tenant'ları tarayan global bir tetikleyicidir (test/operasyonel).
   */
  @Post("trigger-reminders")
  @UseGuards(RolesGuard)
  @Roles("COMPANY_ADMIN")
  triggerReminders(): Promise<{ sent: number; skipped: number }> {
    return this.reminders.sendReminders();
  }

  @Get(":id")
  @RequirePermissions("approval:view")
  getOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
  ): Promise<unknown> {
    return this.service.getOne(user.tenantId, id);
  }

  @Post(":id/approve")
  @RequirePermissions("approval:approve")
  approve(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: DecideStepDto,
  ): Promise<unknown> {
    return this.service.approve(user.tenantId, id, user.id, dto.note);
  }

  @Post(":id/reject")
  @RequirePermissions("approval:approve")
  reject(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: DecideStepDto,
  ): Promise<unknown> {
    return this.service.reject(user.tenantId, id, user.id, dto.note);
  }

  @Post(":id/cancel")
  @RequirePermissions("approval:view")
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: CancelRequestDto,
  ): Promise<unknown> {
    return this.service.cancel(
      user.tenantId,
      id,
      user.id,
      user.role,
      dto.reason,
    );
  }
}
