import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@supkeys/db";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { ListAdminSuppliersDto } from "../dto/list-suppliers.dto";

function parseSupplierSort(
  sort: string | undefined,
): Prisma.SupplierOrderByWithRelationInput {
  const parts = (sort ?? "createdAt:desc").split(":");
  const field = parts[0];
  const dir: Prisma.SortOrder = parts[1] === "asc" ? "asc" : "desc";
  if (field === "companyName") return { companyName: dir };
  return { createdAt: dir };
}

@Injectable()
export class AdminSuppliersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListAdminSuppliersDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const where: Prisma.SupplierWhereInput = {};
    if (query.membership) where.membership = query.membership;
    if (query.search?.trim()) {
      const term = query.search.trim();
      where.OR = [
        { companyName: { contains: term, mode: "insensitive" } },
        { taxNumber: { contains: term, mode: "insensitive" } },
        {
          users: {
            some: { email: { contains: term, mode: "insensitive" } },
          },
        },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.supplier.findMany({
        where,
        include: {
          _count: {
            select: {
              users: true,
              bids: true,
              orders: true,
              tenantRelations: { where: { status: "ACTIVE" } },
            },
          },
          users: {
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
        orderBy: parseSupplierSort(query.sort),
        skip,
        take: pageSize,
      }),
      this.prisma.supplier.count({ where }),
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
    const supplier = await this.prisma.supplier.findUnique({
      where: { id },
      include: {
        users: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            isActive: true,
            lastLoginAt: true,
            createdAt: true,
          },
          orderBy: { createdAt: "asc" },
        },
        _count: {
          select: {
            users: true,
            bids: true,
            orders: true,
            tenantRelations: { where: { status: "ACTIVE" } },
          },
        },
      },
    });

    if (!supplier) throw new NotFoundException("Tedarikçi bulunamadı");

    const [bidsByStatus, ordersByStatus, totalRevenue, winRatePercent] =
      await Promise.all([
        this.prisma.bid.groupBy({
          by: ["status"],
          where: { supplierId: id },
          _count: { _all: true },
        }),
        this.prisma.order.groupBy({
          by: ["status"],
          where: { supplierId: id },
          _count: { _all: true },
        }),
        this.prisma.order.aggregate({
          where: { supplierId: id, status: "COMPLETED" },
          _sum: { totalAmount: true },
        }),
        this.calculateWinRate(id),
      ]);

    return {
      ...supplier,
      analytics: {
        bidsByStatus: bidsByStatus.map((b) => ({
          status: b.status,
          count: b._count._all,
        })),
        ordersByStatus: ordersByStatus.map((o) => ({
          status: o.status,
          count: o._count._all,
        })),
        totalRevenueCompleted: totalRevenue._sum.totalAmount ?? 0,
        winRatePercent,
      },
    };
  }

  /**
   * Kazanma oranı = AWARDED bid'ler / final state'e ulaşmış bid'ler.
   * Final state: SUBMITTED (henüz kazandırma yapılmamış) sayılmaz; sadece
   * AWARDED_FULL/PARTIAL + LOST'a göre. WITHDRAWN/REJECTED/DRAFT dışı.
   */
  private async calculateWinRate(supplierId: string): Promise<number> {
    const [decided, awarded] = await Promise.all([
      this.prisma.bid.count({
        where: {
          supplierId,
          status: { in: ["AWARDED_FULL", "AWARDED_PARTIAL", "LOST"] },
        },
      }),
      this.prisma.bid.count({
        where: {
          supplierId,
          status: { in: ["AWARDED_FULL", "AWARDED_PARTIAL"] },
        },
      }),
    ]);
    if (decided === 0) return 0;
    return Math.round((awarded / decided) * 100);
  }
}
