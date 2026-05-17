import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import { AdminJwtAuthGuard } from "../../admin-auth/guards/admin-jwt-auth.guard";
import { AdminUpdateTenantUserDto } from "../dto/admin-update-tenant-user.dto";
import { ListAdminTenantsDto } from "../dto/list-tenants.dto";
import { UpdateTenantDto } from "../dto/update-tenant.dto";
import { AdminTenantUsersService } from "../services/admin-tenant-users.service";
import { AdminTenantsService } from "../services/admin-tenants.service";

interface AdminAuthRequest extends Request {
  user?: { sub: string; type: string };
}

@Controller("admin/tenants")
@UseGuards(AdminJwtAuthGuard)
export class AdminTenantsController {
  constructor(
    private readonly service: AdminTenantsService,
    private readonly users: AdminTenantUsersService,
  ) {}

  @Get()
  list(@Query() query: ListAdminTenantsDto): Promise<unknown> {
    return this.service.list(query);
  }

  @Get(":id")
  getOne(@Param("id") id: string): Promise<unknown> {
    return this.service.getOne(id);
  }

  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body() dto: UpdateTenantDto,
  ): Promise<unknown> {
    return this.service.update(id, dto);
  }

  // ---------- Tenant kullanıcı aksiyonları (admin destek) ----------

  @Patch(":tenantId/users/:userId")
  updateUser(
    @Param("tenantId") tenantId: string,
    @Param("userId") userId: string,
    @Body() dto: AdminUpdateTenantUserDto,
    @Req() req: AdminAuthRequest,
  ): Promise<unknown> {
    return this.users.updateUser(tenantId, userId, dto, req.user?.sub ?? "");
  }

  @Post(":tenantId/users/:userId/password-reset")
  issuePasswordReset(
    @Param("tenantId") tenantId: string,
    @Param("userId") userId: string,
    @Req() req: AdminAuthRequest,
  ): Promise<unknown> {
    return this.users.issuePasswordReset(
      tenantId,
      userId,
      req.user?.sub ?? "",
    );
  }

  @Delete(":tenantId/invitations/:invitationId")
  cancelInvitation(
    @Param("tenantId") tenantId: string,
    @Param("invitationId") invitationId: string,
    @Req() req: AdminAuthRequest,
  ): Promise<unknown> {
    return this.users.cancelInvitation(
      tenantId,
      invitationId,
      req.user?.sub ?? "",
    );
  }
}
