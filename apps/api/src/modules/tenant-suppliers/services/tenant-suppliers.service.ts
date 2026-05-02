import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Prisma } from "@supkeys/db";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { EmailQueue } from "../../email/email.queue";
import { BlockSupplierDto } from "../dto/block-supplier.dto";
import { ListSuppliersDto } from "../dto/list-suppliers.dto";
import { RejectRelationDto } from "../dto/reject-relation.dto";

@Injectable()
export class TenantSuppliersService {
  private readonly logger = new Logger(TenantSuppliersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailQueue: EmailQueue,
    private readonly config: ConfigService,
  ) {}

  async list(tenantId: string, query: ListSuppliersDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const where: Prisma.SupplierTenantRelationWhereInput = { tenantId };
    if (query.status) where.status = query.status;
    if (query.search) {
      const term = query.search.trim();
      where.supplier = {
        OR: [
          { companyName: { contains: term, mode: "insensitive" } },
          { taxNumber: { contains: term } },
        ],
      };
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.supplierTenantRelation.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: "desc" },
        include: {
          supplier: {
            include: {
              users: {
                orderBy: { createdAt: "asc" },
                take: 1,
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true,
                  phone: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.supplierTenantRelation.count({ where }),
    ]);

    return {
      items: items.map((r) => this.serializeRelation(r)),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async findOne(tenantId: string, relationId: string) {
    const relation = await this.prisma.supplierTenantRelation.findFirst({
      where: { id: relationId, tenantId },
      include: {
        supplier: {
          include: {
            users: {
              orderBy: { createdAt: "asc" },
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                phone: true,
                isActive: true,
              },
            },
          },
        },
      },
    });
    if (!relation) throw new NotFoundException("Tedarikçi bulunamadı");
    return this.serializeRelation(relation);
  }

  async stats(tenantId: string) {
    const grouped = await this.prisma.supplierTenantRelation.groupBy({
      by: ["status"],
      where: { tenantId },
      _count: { _all: true },
    });
    const total = await this.prisma.supplierTenantRelation.count({
      where: { tenantId },
    });
    const byStatus = grouped.reduce(
      (acc, row) => {
        acc[row.status] = row._count._all;
        return acc;
      },
      {} as Record<string, number>,
    );
    return {
      total,
      active: byStatus.ACTIVE ?? 0,
      blocked: byStatus.BLOCKED ?? 0,
      pending: byStatus.PENDING_TENANT_APPROVAL ?? 0,
    };
  }

  async block(
    tenantId: string,
    relationId: string,
    dto: BlockSupplierDto,
  ) {
    const relation = await this.prisma.supplierTenantRelation.findFirst({
      where: { id: relationId, tenantId },
      select: { id: true, status: true },
    });
    if (!relation) throw new NotFoundException("Tedarikçi bulunamadı");
    if (relation.status === "BLOCKED") {
      throw new ConflictException("Bu tedarikçi zaten engellenmiş");
    }

    const updated = await this.prisma.supplierTenantRelation.update({
      where: { id: relation.id },
      data: {
        status: "BLOCKED",
        blockedAt: new Date(),
        blockedReason: dto.reason.trim(),
      },
      include: {
        supplier: {
          include: {
            users: {
              orderBy: { createdAt: "asc" },
              take: 1,
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                phone: true,
              },
            },
          },
        },
      },
    });
    return this.serializeRelation(updated);
  }

  async unblock(tenantId: string, relationId: string) {
    const relation = await this.prisma.supplierTenantRelation.findFirst({
      where: { id: relationId, tenantId },
      select: { id: true, status: true },
    });
    if (!relation) throw new NotFoundException("Tedarikçi bulunamadı");
    if (relation.status !== "BLOCKED") {
      throw new ConflictException("Sadece engelli tedarikçilerin engeli kaldırılabilir");
    }

    const updated = await this.prisma.supplierTenantRelation.update({
      where: { id: relation.id },
      data: {
        status: "ACTIVE",
        blockedAt: null,
        blockedReason: null,
      },
      include: {
        supplier: {
          include: {
            users: {
              orderBy: { createdAt: "asc" },
              take: 1,
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                phone: true,
              },
            },
          },
        },
      },
    });
    return this.serializeRelation(updated);
  }

  /**
   * Bu tenant'a yönelik PENDING_TENANT_APPROVAL ilişkilerinin listesi.
   * Sıralama: en yeni talepler üstte.
   */
  async listPendingRelations(tenantId: string) {
    const items = await this.prisma.supplierTenantRelation.findMany({
      where: { tenantId, status: "PENDING_TENANT_APPROVAL" },
      orderBy: { createdAt: "desc" },
      include: {
        supplier: {
          select: {
            id: true,
            companyName: true,
            companyType: true,
            taxNumber: true,
            taxOffice: true,
            industry: true,
            city: true,
            district: true,
            membership: true,
            users: {
              orderBy: { createdAt: "asc" },
              take: 1,
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                phone: true,
              },
            },
          },
        },
      },
    });

    return {
      items: items.map((rel) => ({
        relationId: rel.id,
        createdAt: rel.createdAt,
        supplier: {
          id: rel.supplier.id,
          companyName: rel.supplier.companyName,
          companyType: rel.supplier.companyType,
          taxNumber: rel.supplier.taxNumber,
          taxOffice: rel.supplier.taxOffice,
          industry: rel.supplier.industry,
          city: rel.supplier.city,
          district: rel.supplier.district,
          membership: rel.supplier.membership,
          primaryUser: rel.supplier.users[0] ?? null,
        },
      })),
      count: items.length,
    };
  }

  /**
   * PENDING_TENANT_APPROVAL'daki ilişkiyi ACTIVE'e çevirir, tedarikçiye
   * "onaylandı" e-postası gönderir.
   */
  async approveRelation(tenantId: string, relationId: string) {
    const relation = await this.prisma.supplierTenantRelation.findFirst({
      where: { id: relationId, tenantId },
      include: {
        tenant: { select: { name: true } },
        supplier: {
          select: {
            id: true,
            companyName: true,
            users: {
              orderBy: { createdAt: "asc" },
              take: 1,
              select: { firstName: true, email: true },
            },
          },
        },
      },
    });
    if (!relation) throw new NotFoundException("İlişki bulunamadı");
    if (relation.status !== "PENDING_TENANT_APPROVAL") {
      throw new ConflictException(
        "Sadece onay bekleyen talepler onaylanabilir",
      );
    }

    const updated = await this.prisma.supplierTenantRelation.update({
      where: { id: relation.id },
      data: { status: "ACTIVE", blockedAt: null, blockedReason: null },
    });

    this.dispatchRelationApprovedEmail(relation).catch((err) => {
      this.logger.error(
        `relationApproved email enqueue failed (${relationId}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    });

    return {
      relationId: updated.id,
      status: updated.status,
      message: "Tedarikçi onaylandı",
    };
  }

  /**
   * PENDING_TENANT_APPROVAL'daki ilişkiyi BLOCKED'e çevirir + tedarikçiye
   * red bildirimi gönderir.
   */
  async rejectRelation(
    tenantId: string,
    relationId: string,
    dto: RejectRelationDto,
  ) {
    const relation = await this.prisma.supplierTenantRelation.findFirst({
      where: { id: relationId, tenantId },
      include: {
        tenant: { select: { name: true } },
        supplier: {
          select: {
            id: true,
            companyName: true,
            users: {
              orderBy: { createdAt: "asc" },
              take: 1,
              select: { firstName: true, email: true },
            },
          },
        },
      },
    });
    if (!relation) throw new NotFoundException("İlişki bulunamadı");
    if (relation.status !== "PENDING_TENANT_APPROVAL") {
      throw new ConflictException(
        "Sadece onay bekleyen talepler reddedilebilir",
      );
    }

    const reason = dto.reason?.trim() || "Alıcı tarafından reddedildi";
    const updated = await this.prisma.supplierTenantRelation.update({
      where: { id: relation.id },
      data: {
        status: "BLOCKED",
        blockedAt: new Date(),
        blockedReason: reason,
      },
    });

    this.dispatchRelationRejectedEmail(relation, reason).catch((err) => {
      this.logger.error(
        `relationRejected email enqueue failed (${relationId}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    });

    return {
      relationId: updated.id,
      status: updated.status,
      blockedReason: updated.blockedReason,
      message: "Talep reddedildi",
    };
  }

  // ---------- email helpers ----------

  private async dispatchRelationApprovedEmail(relation: {
    id: string;
    tenant: { name: string };
    supplier: {
      companyName: string;
      users: { firstName: string; email: string }[];
    };
  }) {
    const primary = relation.supplier.users[0];
    if (!primary) return;
    const webUrl = this.config
      .get<string>("WEB_URL", "http://localhost:3000")
      .replace(/\/$/, "");
    await this.emailQueue.enqueue({
      to: { email: primary.email, name: primary.firstName },
      templateData: {
        template: "supplier_relation_approved",
        data: {
          supplierContactName: primary.firstName,
          tenantName: relation.tenant.name,
          profileUrl: `${webUrl}/supplier/profil`,
        },
      },
      context: { type: "supplier_relation", id: relation.id },
      subject: `✓ ${relation.tenant.name} bağlantınızı onayladı — Supkeys`,
    });
  }

  private async dispatchRelationRejectedEmail(
    relation: {
      id: string;
      tenant: { name: string };
      supplier: {
        companyName: string;
        users: { firstName: string; email: string }[];
      };
    },
    reason: string,
  ) {
    const primary = relation.supplier.users[0];
    if (!primary) return;
    const webUrl = this.config
      .get<string>("WEB_URL", "http://localhost:3000")
      .replace(/\/$/, "");
    const supportEmail = this.config.get<string>(
      "EMAIL_REPLY_TO",
      "support@supkeys.com",
    );
    await this.emailQueue.enqueue({
      to: { email: primary.email, name: primary.firstName },
      templateData: {
        template: "supplier_relation_rejected",
        data: {
          supplierContactName: primary.firstName,
          tenantName: relation.tenant.name,
          reason,
          profileUrl: `${webUrl}/supplier/profil`,
          supportEmail: supportEmail || "support@supkeys.com",
        },
      },
      context: { type: "supplier_relation", id: relation.id },
      subject: `${relation.tenant.name} bağlantı talebinizi yanıtladı — Supkeys`,
    });
  }

  // ---------- helpers ----------
  private serializeRelation(
    relation: Prisma.SupplierTenantRelationGetPayload<{
      include: {
        supplier: {
          include: {
            users: {
              select: {
                id: true;
                firstName: true;
                lastName: true;
                email: true;
                phone: true;
                isActive?: true;
              };
            };
          };
        };
      };
    }>,
  ) {
    const { supplier, ...rest } = relation;
    return {
      relationId: rest.id,
      relationStatus: rest.status,
      relationCreatedAt: rest.createdAt,
      blockedAt: rest.blockedAt,
      blockedReason: rest.blockedReason,
      supplier: {
        id: supplier.id,
        companyName: supplier.companyName,
        companyType: supplier.companyType,
        taxNumber: supplier.taxNumber,
        taxOffice: supplier.taxOffice,
        industry: supplier.industry,
        website: supplier.website,
        city: supplier.city,
        district: supplier.district,
        addressLine: supplier.addressLine,
        postalCode: supplier.postalCode,
        membership: supplier.membership,
        isActive: supplier.isActive,
        users: supplier.users,
      },
    };
  }
}
