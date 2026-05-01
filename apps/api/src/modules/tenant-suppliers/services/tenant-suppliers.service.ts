import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "@supkeys/db";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { BlockSupplierDto } from "../dto/block-supplier.dto";
import { ListSuppliersDto } from "../dto/list-suppliers.dto";

@Injectable()
export class TenantSuppliersService {
  constructor(private readonly prisma: PrismaService) {}

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
