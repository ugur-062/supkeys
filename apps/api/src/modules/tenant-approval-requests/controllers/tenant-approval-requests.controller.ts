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
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { CancelRequestDto } from "../dto/cancel-request.dto";
import { DecideStepDto } from "../dto/decide-step.dto";
import { ListApprovalRequestsDto } from "../dto/list-approval-requests.dto";
import { TenantApprovalRequestsService } from "../services/tenant-approval-requests.service";

@Controller("tenants/me/approval-requests")
@UseGuards(JwtAuthGuard)
export class TenantApprovalRequestsController {
  constructor(private readonly service: TenantApprovalRequestsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListApprovalRequestsDto,
  ): Promise<unknown> {
    return this.service.list(user.tenantId, user.id, query);
  }

  @Get("pending-count")
  getPendingCount(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ count: number }> {
    return this.service.getPendingCount(user.tenantId, user.id);
  }

  @Get(":id")
  getOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
  ): Promise<unknown> {
    return this.service.getOne(user.tenantId, id);
  }

  @Post(":id/approve")
  approve(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: DecideStepDto,
  ): Promise<unknown> {
    return this.service.approve(user.tenantId, id, user.id, dto.note);
  }

  @Post(":id/reject")
  reject(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: DecideStepDto,
  ): Promise<unknown> {
    return this.service.reject(user.tenantId, id, user.id, dto.note);
  }

  @Post(":id/cancel")
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
