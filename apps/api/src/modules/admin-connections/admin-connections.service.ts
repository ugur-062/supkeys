import {
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@supkeys/db";
import { PrismaService } from "../../common/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import {
  ListConnectionsDto,
  UpdateConnectionDto,
} from "./dto/admin-connections.dto";

@Injectable()
export class AdminConnectionsService {
  private readonly logger = new Logger(AdminConnectionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListConnectionsDto) {
    const page = Math.max(1, query.page ? Number(query.page) : 1);
    const pageSize = Math.min(100, query.pageSize ? Number(query.pageSize) : 30);

    const where: Prisma.SupplierTenantRelationWhereInput = {};
    if (query.supplierId) where.supplierId = query.supplierId;
    if (query.tenantId) where.tenantId = query.tenantId;
    if (query.status) where.status = query.status as never;
    if (query.search?.trim()) {
      const term = query.search.trim();
      where.OR = [
        { supplier: { companyName: { contains: term, mode: "insensitive" } } },
        { tenant: { name: { contains: term, mode: "insensitive" } } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.supplierTenantRelation.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          status: true,
          origin: true,
          requestedAt: true,
          decidedAt: true,
          blockedAt: true,
          blockedReason: true,
          createdAt: true,
          supplier: { select: { id: true, companyName: true, membership: true } },
          tenant: { select: { id: true, name: true } },
        },
      }),
      this.prisma.supplierTenantRelation.count({ where }),
    ]);

    return {
      items,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    };
  }

  async updateStatus(id: string, dto: UpdateConnectionDto, adminId: string) {
    const rel = await this.prisma.supplierTenantRelation.findUnique({
      where: { id },
      select: { id: true, supplierId: true, tenantId: true },
    });
    if (!rel) throw new NotFoundException("Bağlantı bulunamadı");

    const updated = await this.prisma.supplierTenantRelation.update({
      where: { id },
      data:
        dto.status === "BLOCKED"
          ? {
              status: "BLOCKED",
              blockedAt: new Date(),
              blockedReason: dto.blockedReason?.trim() || null,
            }
          : {
              status: "ACTIVE",
              decidedAt: new Date(),
              decidedById: adminId || null,
              blockedAt: null,
              blockedReason: null,
            },
      select: { id: true, status: true },
    });

    void this.audit.log({
      action: dto.status === "BLOCKED" ? "connection.blocked" : "connection.activated",
      actorType: "admin",
      actorId: adminId || null,
      tenantId: rel.tenantId,
      entityType: "supplier_tenant_relation",
      entityId: id,
      metadata: { supplierId: rel.supplierId, reason: dto.blockedReason },
    });
    this.logger.log(`Admin ${adminId} set connection ${id} → ${dto.status}`);
    return updated;
  }

  async remove(id: string, adminId: string) {
    const rel = await this.prisma.supplierTenantRelation.findUnique({
      where: { id },
      select: { id: true, supplierId: true, tenantId: true },
    });
    if (!rel) throw new NotFoundException("Bağlantı bulunamadı");
    await this.prisma.supplierTenantRelation.delete({ where: { id } });
    void this.audit.log({
      action: "connection.removed",
      actorType: "admin",
      actorId: adminId || null,
      tenantId: rel.tenantId,
      entityType: "supplier_tenant_relation",
      entityId: id,
      metadata: { supplierId: rel.supplierId },
    });
    this.logger.log(`Admin ${adminId} removed connection ${id}`);
    return { success: true };
  }
}
