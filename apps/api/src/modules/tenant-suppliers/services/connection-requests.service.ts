import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../../common/prisma/prisma.service";

/**
 * Faz 3 — "Tedarikçi Ol" (CONNECT_REQUEST) gelen istekleri.
 * Alıcı, KYC'den geçmiş (doğrulanmış) firmaların ilişki isteklerini görür ve
 * onaylar/reddeder. Onay → ilişki ACTIVE + kota (selfRequestUsedAt) dolar.
 */
@Injectable()
export class ConnectionRequestsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string) {
    const rows = await this.prisma.supplierTenantRelation.findMany({
      where: {
        tenantId,
        status: "PENDING_TENANT_APPROVAL",
        origin: "CONNECT_REQUEST",
      },
      orderBy: { requestedAt: "asc" },
      select: {
        id: true,
        requestedAt: true,
        createdAt: true,
        supplier: {
          select: {
            id: true,
            companyName: true,
            companyType: true,
            taxNumber: true,
            taxOffice: true,
            industry: true,
            website: true,
            city: true,
            district: true,
            taxCertUrl: true,
            membership: true,
            categories: {
              select: {
                category: { select: { nameTr: true, segmentLetter: true } },
              },
            },
          },
        },
      },
    });

    return rows.map((r) => ({
      id: r.id,
      requestedAt: r.requestedAt ?? r.createdAt,
      supplier: {
        id: r.supplier.id,
        companyName: r.supplier.companyName,
        companyType: r.supplier.companyType,
        taxNumber: r.supplier.taxNumber,
        taxOffice: r.supplier.taxOffice,
        industry: r.supplier.industry,
        website: r.supplier.website,
        city: r.supplier.city,
        district: r.supplier.district,
        taxCertUrl: r.supplier.taxCertUrl,
        membership: r.supplier.membership,
        categories: r.supplier.categories.map((c) => ({
          nameTr: c.category.nameTr,
          segmentLetter: c.category.segmentLetter,
        })),
      },
    }));
  }

  async count(tenantId: string): Promise<{ count: number }> {
    const count = await this.prisma.supplierTenantRelation.count({
      where: {
        tenantId,
        status: "PENDING_TENANT_APPROVAL",
        origin: "CONNECT_REQUEST",
      },
    });
    return { count };
  }

  private async findPending(tenantId: string, relationId: string) {
    const rel = await this.prisma.supplierTenantRelation.findFirst({
      where: { id: relationId, tenantId, origin: "CONNECT_REQUEST" },
      select: { id: true, status: true, supplierId: true },
    });
    if (!rel) throw new NotFoundException("İstek bulunamadı");
    if (rel.status !== "PENDING_TENANT_APPROVAL") {
      throw new ConflictException("Bu istek zaten sonuçlandırılmış");
    }
    return rel;
  }

  async approve(tenantId: string, relationId: string, userId: string) {
    const rel = await this.findPending(tenantId, relationId);
    await this.prisma.$transaction([
      this.prisma.supplierTenantRelation.update({
        where: { id: rel.id },
        data: {
          status: "ACTIVE",
          decidedAt: new Date(),
          decidedById: userId,
        },
      }),
      // Kota: self-request ile ilk kez bir alıcıya bağlanınca dolar.
      this.prisma.supplier.updateMany({
        where: { id: rel.supplierId, selfRequestUsedAt: null },
        data: { selfRequestUsedAt: new Date() },
      }),
    ]);
    return { id: rel.id, status: "ACTIVE" as const };
  }

  async reject(tenantId: string, relationId: string) {
    const rel = await this.findPending(tenantId, relationId);
    // Red → bekleyen ilişki silinir. Firma doğrulanmış tedarikçi olarak kalır.
    await this.prisma.supplierTenantRelation.delete({ where: { id: rel.id } });
    return { id: rel.id, status: "REJECTED" as const };
  }
}
