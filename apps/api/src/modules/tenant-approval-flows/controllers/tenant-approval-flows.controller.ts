import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import type { ApprovalFlowStatus } from "@supkeys/db";
import {
  CurrentUser,
  type AuthenticatedUser,
} from "../../../common/decorators/current-user.decorator";
import { Roles } from "../../../common/decorators/roles.decorator";
import { RolesGuard } from "../../../common/guards/roles.guard";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { CreateApprovalFlowDto } from "../dto/create-approval-flow.dto";
import { ListApprovalFlowsDto } from "../dto/list-approval-flows.dto";
import {
  ChangeApprovalFlowStatusDto,
  UpdateApprovalFlowDto,
} from "../dto/update-approval-flow.dto";
import { TenantApprovalFlowsService } from "../services/tenant-approval-flows.service";

@Controller("tenants/me/approval-flows")
@UseGuards(JwtAuthGuard)
export class TenantApprovalFlowsController {
  constructor(private readonly service: TenantApprovalFlowsService) {}

  @Get()
  list(
    @Query() query: ListApprovalFlowsDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.service.list(user.tenantId, query);
  }

  @Get(":id")
  getOne(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.service.getOne(user.tenantId, id);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles("COMPANY_ADMIN")
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateApprovalFlowDto,
  ): Promise<unknown> {
    return this.service.create(user.tenantId, user.id, dto);
  }

  @Patch(":id")
  @UseGuards(RolesGuard)
  @Roles("COMPANY_ADMIN")
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: UpdateApprovalFlowDto,
  ): Promise<unknown> {
    return this.service.update(user.tenantId, id, dto);
  }

  @Patch(":id/status")
  @UseGuards(RolesGuard)
  @Roles("COMPANY_ADMIN")
  changeStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: ChangeApprovalFlowStatusDto,
  ): Promise<unknown> {
    return this.service.changeStatus(
      user.tenantId,
      id,
      dto.status as ApprovalFlowStatus,
    );
  }

  @Post(":id/duplicate")
  @UseGuards(RolesGuard)
  @Roles("COMPANY_ADMIN")
  duplicate(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
  ): Promise<unknown> {
    return this.service.duplicate(user.tenantId, user.id, id);
  }

  @Delete(":id")
  @UseGuards(RolesGuard)
  @Roles("COMPANY_ADMIN")
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
  ): Promise<unknown> {
    return this.service.remove(user.tenantId, id);
  }
}
