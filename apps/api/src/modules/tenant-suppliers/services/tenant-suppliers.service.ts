import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "@supkeys/db";
import { normalizeShortCode, validateShortCode } from "@supkeys/shared";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { BlockSupplierDto } from "../dto/block-supplier.dto";
import { ListSuppliersDto } from "../dto/list-suppliers.dto";

@Injectable()
export class TenantSuppliersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Faz 3 madde 6 — Alıcı, tedarikçinin Supkeys ID'sini girerek doğrudan
   * bağlantı kurar. Alıcı kendi havuzunu yönettiğinden ilişki direkt ACTIVE
   * olur (tedarikçi sonradan bloklayabilir).
   */
  async connectBySupkeysId(tenantId: string, supkeysIdInput: string) {
    const code = normalizeShortCode(
      supkeysIdInput.trim().replace(/^SK-?/i, ""),
    );
    if (!validateShortCode(code)) {
      throw new BadRequestException("Geçersiz Supkeys ID formatı");
    }
    const supplier = await this.prisma.supplier.findUnique({
      where: { supkeysId: code },
      select: { id: true, companyName: true },
    });
    if (!supplier) {
      throw new NotFoundException("Bu Supkeys ID ile bir tedarikçi bulunamadı");
    }

    const existing = await this.prisma.supplierTenantRelation.findUnique({
      where: { supplierId_tenantId: { supplierId: supplier.id, tenantId } },
      select: { status: true },
    });
    if (existing) {
      if (existing.status === "ACTIVE")
        throw new ConflictException("Bu tedarikçiyle zaten bağlısınız");
      if (existing.status === "PENDING_TENANT_APPROVAL")
        throw new ConflictException(
          "Bu tedarikçinin bağlantı isteği zaten bekliyor — Tedarikçiler sayfasından onaylayın",
        );
      if (existing.status === "BLOCKED")
        throw new ConflictException(
          "Bu tedarikçi engelli; önce engeli kaldırın",
        );
    }

    const relation = await this.prisma.supplierTenantRelation.create({
      data: {
        supplierId: supplier.id,
        tenantId,
        status: "ACTIVE",
        origin: "INVITE",
      },
    });

    return {
      relationId: relation.id,
      supplierName: supplier.companyName,
      status: "ACTIVE" as const,
      message: `${supplier.companyName} tedarikçinizle bağlantı kuruldu.`,
    };
  }

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
    // Self-bağlantı (CONNECT_REQUEST) yalnızca tedarikçi PREMIUM iken etkin
    // sayılır; premium biterse alıcının listesinden düşer, tekrar premium
    // olunca otomatik geri gelir. INVITE/ADMIN (alıcı eklemesi) her zaman kalıcı.
    where.OR = [
      { origin: { not: "CONNECT_REQUEST" } },
      { supplier: { membership: "PREMIUM" } },
    ];

    const [items, total] = await Promise.all([
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

  /**
   * Tedarikçi Havuzu (alıcı keşif). Görünenler: TÜM premium tedarikçiler +
   * bu alıcının kendi ACTIVE bağlı (standart dahil) tedarikçileri.
   * Arama: firma adı / Supkeys ID. Filtre: UNSPSC kategori.
   */
  async pool(
    tenantId: string,
    opts: { search?: string; sector?: string },
  ) {
    const relations = await this.prisma.supplierTenantRelation.findMany({
      where: { tenantId },
      select: { supplierId: true, status: true },
    });
    const relMap = new Map(relations.map((r) => [r.supplierId, r.status]));
    const connectedActiveIds = relations
      .filter((r) => r.status === "ACTIVE")
      .map((r) => r.supplierId);

    const and: Prisma.SupplierWhereInput[] = [
      { isActive: true, isBlocked: false },
      // PREMIUM herkese görünür + bu alıcının bağlı (standart dahil) olanları.
      { OR: [{ membership: "PREMIUM" }, { id: { in: connectedActiveIds } }] },
    ];

    const term = opts.search?.trim();
    if (term) {
      const idTerm = normalizeShortCode(term.replace(/^SK-?/i, ""));
      and.push({
        OR: [
          { companyName: { contains: term, mode: "insensitive" } },
          { supkeysId: { equals: idTerm } },
        ],
      });
    }
    // Sektör filtresi — UNSPSC ana kategori (segment id).
    if (opts.sector) {
      and.push({ sectorCategoryIds: { has: opts.sector } });
    }

    const suppliers = await this.prisma.supplier.findMany({
      where: { AND: and },
      take: 100,
      orderBy: [{ membership: "asc" }, { companyName: "asc" }],
      select: {
        id: true,
        companyName: true,
        city: true,
        district: true,
        industry: true,
        website: true,
        services: true,
        sectorCategoryIds: true,
        logoImageUrl: true,
        slug: true,
        publicEnabled: true,
        supkeysId: true,
        membership: true,
      },
    });

    // Ana kategori id'lerini görüntü için isme çevir.
    const allCatIds = Array.from(
      new Set(suppliers.flatMap((s) => s.sectorCategoryIds)),
    );
    const nameMap = new Map<string, string>();
    if (allCatIds.length > 0) {
      const cats = await this.prisma.category.findMany({
        where: { id: { in: allCatIds } },
        select: { id: true, nameTr: true },
      });
      for (const c of cats) nameMap.set(c.id, c.nameTr);
    }

    return suppliers.map((s) => ({
      id: s.id,
      companyName: s.companyName,
      city: s.city,
      district: s.district,
      industry: s.industry,
      website: s.website,
      services: s.services,
      logoUrl: s.logoImageUrl,
      slug: s.slug,
      publicEnabled: s.publicEnabled,
      supkeysId: s.supkeysId,
      membership: s.membership,
      sectors: s.sectorCategoryIds
        .map((id) => nameMap.get(id))
        .filter((n): n is string => !!n),
      relationStatus: relMap.get(s.id) ?? null,
    }));
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
