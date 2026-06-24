import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@supkeys/db";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { ListAdminSuppliersDto } from "../dto/list-suppliers.dto";
import {
  AdminUpdateSupplierUserDto,
  UpdateSupplierDto,
} from "../dto/update-supplier.dto";

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
  private readonly logger = new Logger(AdminSuppliersService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ----- PATCH supplier (üyelik + blok + metadata) -----

  async update(id: string, dto: UpdateSupplierDto, adminId: string) {
    const supplier = await this.prisma.supplier.findUnique({
      where: { id },
      select: { id: true, isActive: true },
    });
    if (!supplier) throw new NotFoundException("Tedarikçi bulunamadı");

    const data: Prisma.SupplierUpdateInput = {};
    if (dto.membership !== undefined) data.membership = dto.membership;

    // Blokla/aç — isActive false ise blockedAt/reason set; true ise temizle.
    if (dto.isActive !== undefined) {
      data.isActive = dto.isActive;
      if (dto.isActive === false) {
        data.blockedAt = new Date();
        data.blockedReason = dto.blockedReason?.trim() || null;
      } else {
        data.blockedAt = null;
        data.blockedReason = null;
      }
    }

    // Metadata
    if (dto.companyName !== undefined) data.companyName = dto.companyName.trim();
    if (dto.taxNumber !== undefined)
      data.taxNumber = dto.taxNumber?.trim() || null;
    if (dto.taxOffice !== undefined) data.taxOffice = dto.taxOffice.trim();
    if (dto.industry !== undefined) data.industry = dto.industry?.trim() || null;
    if (dto.website !== undefined) data.website = dto.website?.trim() || null;
    if (dto.city !== undefined) data.city = dto.city.trim();
    if (dto.district !== undefined) data.district = dto.district.trim();
    if (dto.addressLine !== undefined)
      data.addressLine = dto.addressLine.trim();
    if (dto.postalCode !== undefined)
      data.postalCode = dto.postalCode?.trim() || null;

    if (Object.keys(data).length === 0) return { id, updated: false };

    try {
      const updated = await this.prisma.supplier.update({
        where: { id },
        data,
        select: {
          id: true,
          companyName: true,
          membership: true,
          isActive: true,
          blockedAt: true,
          blockedReason: true,
          taxNumber: true,
        },
      });
      this.logger.log(
        `Admin ${adminId} updated supplier ${id}: ${JSON.stringify(
          Object.keys(data),
        )}`,
      );
      return updated;
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        throw new ConflictException(
          "Bu vergi numarası başka bir tedarikçide kayıtlı",
        );
      }
      throw err;
    }
  }

  // ----- PATCH supplier user (aktif/pasif) -----

  async updateUser(
    supplierId: string,
    userId: string,
    dto: AdminUpdateSupplierUserDto,
    adminId: string,
  ) {
    const target = await this.prisma.supplierUser.findUnique({
      where: { id: userId },
      select: { id: true, supplierId: true, isManager: true, isActive: true },
    });
    if (!target || target.supplierId !== supplierId) {
      throw new NotFoundException("Kullanıcı bulunamadı");
    }

    // Son aktif yöneticiyi pasifleştiremez.
    if (target.isManager && dto.isActive === false) {
      const otherManagers = await this.prisma.supplierUser.count({
        where: {
          supplierId,
          isManager: true,
          isActive: true,
          id: { not: userId },
        },
      });
      if (otherManagers === 0) {
        throw new ConflictException("En az bir aktif yönetici olmak zorunda");
      }
    }

    if (dto.isActive === undefined) return { id: userId, updated: false };

    const updated = await this.prisma.supplierUser.update({
      where: { id: userId },
      data: { isActive: dto.isActive },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        isActive: true,
      },
    });
    this.logger.log(
      `Admin ${adminId} updated supplier user ${userId} (${supplierId}): isActive=${dto.isActive}`,
    );
    return updated;
  }

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
      // isBlocked tedarikçide isActive=false demektir (blockedAt/Reason detayı).
      items: items.map((s) => ({ ...s, isBlocked: !s.isActive })),
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
      isBlocked: !supplier.isActive,
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
