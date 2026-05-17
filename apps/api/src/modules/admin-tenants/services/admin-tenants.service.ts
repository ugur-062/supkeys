import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@supkeys/db";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { ListAdminTenantsDto } from "../dto/list-tenants.dto";
import { UpdateTenantDto } from "../dto/update-tenant.dto";

function parseTenantSort(
  sort: string | undefined,
): Prisma.TenantOrderByWithRelationInput {
  const parts = (sort ?? "createdAt:desc").split(":");
  const field = parts[0];
  const dir: Prisma.SortOrder = parts[1] === "asc" ? "asc" : "desc";
  if (field === "name") return { name: dir };
  return { createdAt: dir };
}

@Injectable()
export class AdminTenantsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListAdminTenantsDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const where: Prisma.TenantWhereInput = {};
    if (query.search?.trim()) {
      const term = query.search.trim();
      where.OR = [
        { name: { contains: term, mode: "insensitive" } },
        { taxNumber: { contains: term, mode: "insensitive" } },
        {
          users: {
            some: { email: { contains: term, mode: "insensitive" } },
          },
        },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.tenant.findMany({
        where,
        include: {
          _count: {
            select: {
              users: true,
              tenders: true,
              orders: true,
              supplierRelations: { where: { status: "ACTIVE" } },
            },
          },
          users: {
            where: { role: "COMPANY_ADMIN" },
            orderBy: { createdAt: "asc" },
            take: 1,
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              lastLoginAt: true,
            },
          },
        },
        orderBy: parseTenantSort(query.sort),
        skip,
        take: pageSize,
      }),
      this.prisma.tenant.count({ where }),
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

  async getOne(id: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      include: {
        users: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            role: true,
            isActive: true,
            lastLoginAt: true,
            createdAt: true,
          },
          orderBy: { createdAt: "asc" },
        },
        _count: {
          select: {
            users: true,
            tenders: true,
            orders: true,
            supplierRelations: { where: { status: "ACTIVE" } },
            approvalFlows: { where: { status: "ACTIVE" } },
          },
        },
      },
    });

    if (!tenant) throw new NotFoundException("Tenant bulunamadı");

    const [tendersByStatus, ordersByStatus, recentTenders, totalSpend] =
      await Promise.all([
        this.prisma.tender.groupBy({
          by: ["status"],
          where: { tenantId: id },
          _count: { _all: true },
        }),
        this.prisma.order.groupBy({
          by: ["status"],
          where: { tenantId: id },
          _count: { _all: true },
        }),
        this.prisma.tender.findMany({
          where: { tenantId: id },
          orderBy: { createdAt: "desc" },
          take: 5,
          select: {
            id: true,
            tenderNumber: true,
            title: true,
            status: true,
            primaryCurrency: true,
            createdAt: true,
          },
        }),
        this.prisma.order.aggregate({
          where: { tenantId: id, status: "COMPLETED" },
          _sum: { totalAmount: true },
        }),
      ]);

    // V2-6.5 — BUYER kontenjan kullanımı (aktif user + bekleyen davet)
    const [buyerActiveCount, buyerPendingInvites] = await Promise.all([
      this.prisma.user.count({
        where: { tenantId: id, role: "BUYER", isActive: true },
      }),
      this.prisma.userInvitation.count({
        where: { tenantId: id, role: "BUYER", status: "PENDING" },
      }),
    ]);

    return {
      ...tenant,
      buyerSeatUsage: {
        active: buyerActiveCount,
        pending: buyerPendingInvites,
        used: buyerActiveCount + buyerPendingInvites,
        limit: tenant.buyerSeatLimit,
      },
      analytics: {
        tendersByStatus: tendersByStatus.map((t) => ({
          status: t.status,
          count: t._count._all,
        })),
        ordersByStatus: ordersByStatus.map((o) => ({
          status: o.status,
          count: o._count._all,
        })),
        totalSpendCompleted: totalSpend._sum.totalAmount ?? 0,
        recentTenders,
      },
    };
  }

  async update(id: string, dto: UpdateTenantDto) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      select: { id: true, membershipEndAt: true },
    });
    if (!tenant) throw new NotFoundException("Tenant bulunamadı");

    const data: Prisma.TenantUpdateInput = {};
    if (dto.buyerSeatLimit !== undefined) {
      data.buyerSeatLimit = dto.buyerSeatLimit;
    }

    // V2-6.5 — Tenant meta (destek operasyonları).
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.taxNumber !== undefined) data.taxNumber = dto.taxNumber;
    if (dto.taxOffice !== undefined) data.taxOffice = dto.taxOffice;
    if (dto.industry !== undefined) data.industry = dto.industry;
    if (dto.city !== undefined) data.city = dto.city;
    if (dto.district !== undefined) data.district = dto.district;
    if (dto.addressLine !== undefined) data.addressLine = dto.addressLine;
    if (dto.postalCode !== undefined) data.postalCode = dto.postalCode;

    // V2-6.5 — Üyelik süresi: extendMonths öncelikli; yoksa membershipEndAt
    // doğrudan setlenir (null → sınırsız).
    if (dto.extendMonths !== undefined) {
      const now = new Date();
      const base =
        tenant.membershipEndAt && tenant.membershipEndAt.getTime() > now.getTime()
          ? new Date(tenant.membershipEndAt)
          : now;
      base.setMonth(base.getMonth() + dto.extendMonths);
      data.membershipEndAt = base;
    } else if (dto.membershipEndAt !== undefined) {
      data.membershipEndAt =
        dto.membershipEndAt === null ? null : new Date(dto.membershipEndAt);
    }

    const selectFields = {
      id: true,
      name: true,
      isActive: true,
      taxNumber: true,
      taxOffice: true,
      industry: true,
      city: true,
      district: true,
      addressLine: true,
      postalCode: true,
      buyerSeatLimit: true,
      membershipEndAt: true,
      updatedAt: true,
    } as const;

    if (Object.keys(data).length === 0) {
      return this.prisma.tenant.findUnique({
        where: { id },
        select: selectFields,
      });
    }

    return this.prisma.tenant.update({
      where: { id },
      data,
      select: selectFields,
    });
  }

  // ----- READ-ONLY: tenant ihaleleri -----

  async listTenders(
    id: string,
    opts: { page?: number; pageSize?: number; status?: string } = {},
  ) {
    const page = opts.page ?? 1;
    const pageSize = Math.min(opts.pageSize ?? 20, 100);
    const skip = (page - 1) * pageSize;

    const where: Prisma.TenderWhereInput = { tenantId: id };
    if (opts.status) {
      where.status = opts.status as Prisma.EnumTenderStatusFilter["equals"];
    }

    const [items, total] = await Promise.all([
      this.prisma.tender.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
        select: {
          id: true,
          tenderNumber: true,
          title: true,
          status: true,
          primaryCurrency: true,
          bidsCloseAt: true,
          awardedAt: true,
          cancelledAt: true,
          createdAt: true,
          createdBy: {
            select: { firstName: true, lastName: true, email: true },
          },
          _count: {
            select: { items: true, invitations: true, bids: true },
          },
        },
      }),
      this.prisma.tender.count({ where }),
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

  // ----- READ-ONLY: tenant siparişleri -----

  async listOrders(
    id: string,
    opts: { page?: number; pageSize?: number; status?: string } = {},
  ) {
    const page = opts.page ?? 1;
    const pageSize = Math.min(opts.pageSize ?? 20, 100);
    const skip = (page - 1) * pageSize;

    const where: Prisma.OrderWhereInput = { tenantId: id };
    if (opts.status) {
      where.status = opts.status as Prisma.EnumOrderStatusFilter["equals"];
    }

    const [items, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
        select: {
          id: true,
          orderNumber: true,
          status: true,
          totalAmount: true,
          currency: true,
          createdAt: true,
          completedAt: true,
          cancelledAt: true,
          tender: {
            select: { id: true, tenderNumber: true, title: true },
          },
          supplier: { select: { id: true, companyName: true } },
        },
      }),
      this.prisma.order.count({ where }),
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
}
