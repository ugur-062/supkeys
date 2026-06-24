import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import { AdminJwtAuthGuard } from "../admin-auth/guards/admin-jwt-auth.guard";
import { ListAuditDto } from "./dto/list-audit.dto";

@Controller("admin/audit-logs")
@UseGuards(AdminJwtAuthGuard)
export class AdminAuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
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
