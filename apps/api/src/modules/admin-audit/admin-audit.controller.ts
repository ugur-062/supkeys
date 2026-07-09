import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import { RequireAdminRole } from "../admin-auth/decorators/require-admin-role.decorator";
import { AdminJwtAuthGuard } from "../admin-auth/guards/admin-jwt-auth.guard";
import { AdminRolesGuard } from "../admin-auth/guards/admin-roles.guard";
import { ListAuditDto } from "./dto/list-audit.dto";

// Denetim izi hassas — salt-okuma SUPPORT rolüne kapalı (least-privilege).
@Controller("admin/audit-logs")
@UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
export class AdminAuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @RequireAdminRole("SUPER_ADMIN", "SALES")
  list(@Query() q: ListAuditDto): Promise<unknown> {
    return this.audit.query({
      actorType: q.actorType,
      action: q.action,
      search: q.search,
      page: q.page ? Number(q.page) : undefined,
      pageSize: q.pageSize ? Number(q.pageSize) : undefined,
    });
  }
}
