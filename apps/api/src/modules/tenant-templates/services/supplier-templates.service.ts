import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../../common/prisma/prisma.service";
import type {
  CreateSupplierTemplateDto,
  UpdateSupplierTemplateDto,
} from "../dto/supplier-template.dto";

/**
 * V2-7+ — Tedarikçi Şablonları service'i. Sık birlikte davet edilen
 * tedarikçi gruplarını şablonlar — wizard'dan tek tıkla tüm grubu davet eder.
 */
@Injectable()
export class SupplierTemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string, userId: string) {
    const rows = await this.prisma.supplierTemplate.findMany({
      where: {
        tenantId,
        OR: [{ isPublic: true }, { createdById: userId }],
      },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        _count: { select: { members: true } },
      },
      orderBy: { updatedAt: "desc" },
    });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      isPublic: r.isPublic,
      memberCount: r._count.members,
      createdBy: r.createdBy,
      isOwnedByMe: r.createdById === userId,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  }

  async findOne(tenantId: string, userId: string, id: string) {
    const tpl = await this.prisma.supplierTemplate.findFirst({
      where: { id, tenantId },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        members: {
          include: {
            supplier: {
              select: {
                id: true,
                companyName: true,
                taxNumber: true,
                city: true,
                district: true,
                membership: true,
              },
            },
          },
        },
      },
    });
    if (!tpl) throw new NotFoundException("Şablon bulunamadı");
    if (!tpl.isPublic && tpl.createdById !== userId) {
      throw new ForbiddenException("Bu özel şablona erişim yetkiniz yok");
    }
    return {
      ...tpl,
      isOwnedByMe: tpl.createdById === userId,
      suppliers: tpl.members.map((m) => m.supplier),
    };
  }

  async create(
    tenantId: string,
    userId: string,
    dto: CreateSupplierTemplateDto,
  ) {
    // Tedarikçi ID'leri kontrol — tenant'ın ACTIVE ilişkisi olanlar
    await this.assertSuppliersInScope(tenantId, dto.supplierIds);

    return this.prisma.supplierTemplate.create({
      data: {
        tenantId,
        createdById: userId,
        name: dto.name.trim(),
        isPublic: dto.isPublic,
        members: {
          create: Array.from(new Set(dto.supplierIds)).map((sid) => ({
            supplierId: sid,
          })),
        },
      },
      include: {
        members: {
          include: {
            supplier: {
              select: { id: true, companyName: true, city: true, district: true },
            },
          },
        },
      },
    });
  }

  async update(
    tenantId: string,
    userId: string,
    id: string,
    dto: UpdateSupplierTemplateDto,
  ) {
    const tpl = await this.prisma.supplierTemplate.findFirst({
      where: { id, tenantId },
      select: { id: true, createdById: true },
    });
    if (!tpl) throw new NotFoundException("Şablon bulunamadı");
    if (tpl.createdById !== userId) {
      throw new ForbiddenException("Sadece şablonu oluşturan düzenleyebilir");
    }

    if (dto.supplierIds) {
      await this.assertSuppliersInScope(tenantId, dto.supplierIds);
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.supplierTemplate.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.isPublic !== undefined ? { isPublic: dto.isPublic } : {}),
        },
      });
      if (dto.supplierIds) {
        await tx.supplierTemplateMember.deleteMany({
          where: { templateId: id },
        });
        await tx.supplierTemplateMember.createMany({
          data: Array.from(new Set(dto.supplierIds)).map((sid) => ({
            templateId: id,
            supplierId: sid,
          })),
        });
      }
      return tx.supplierTemplate.findUniqueOrThrow({
        where: { id },
        include: {
          members: {
            include: {
              supplier: {
                select: { id: true, companyName: true, city: true, district: true },
              },
            },
          },
        },
      });
    });
  }

  async delete(tenantId: string, userId: string, id: string) {
    const tpl = await this.prisma.supplierTemplate.findFirst({
      where: { id, tenantId },
      select: { id: true, createdById: true },
    });
    if (!tpl) throw new NotFoundException("Şablon bulunamadı");
    if (tpl.createdById !== userId) {
      throw new ForbiddenException("Sadece şablonu oluşturan silebilir");
    }
    await this.prisma.supplierTemplate.delete({ where: { id } });
    return { id };
  }

  /**
   * Verilen tüm supplier ID'lerinin bu tenant ile ACTIVE ilişkisinin
   * olduğunu doğrular. İlişkisi olmayan tedarikçi şablona eklenemez.
   */
  private async assertSuppliersInScope(
    tenantId: string,
    supplierIds: string[],
  ) {
    if (supplierIds.length === 0) return;
    const unique = Array.from(new Set(supplierIds));
    const relations = await this.prisma.supplierTenantRelation.findMany({
      where: {
        tenantId,
        supplierId: { in: unique },
        status: "ACTIVE",
      },
      select: { supplierId: true },
    });
    const okSet = new Set(relations.map((r) => r.supplierId));
    const missing = unique.filter((id) => !okSet.has(id));
    if (missing.length > 0) {
      throw new NotFoundException(
        `Erişim yetkisi olmayan tedarikçi: ${missing.length} kayıt`,
      );
    }
  }
}
