import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "@supkeys/db";
import { PrismaService } from "../../../common/prisma/prisma.service";
import type { CreateTenderTemplateDto } from "../dto/tender-template.dto";

/**
 * Madde 34 — İhale Şablonları service'i. Tekrarlayan alımlar için isimli,
 * kayıtlı ihale taslakları. `data` = wizard form verisi (kalemler dahil);
 * kapanış tarihi/davetli tedarikçiler/adresler şablona girmez.
 */
@Injectable()
export class TenderTemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string, userId: string) {
    const rows = await this.prisma.tenderTemplate.findMany({
      where: { tenantId },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { updatedAt: "desc" },
    });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      createdBy: r.createdBy,
      isOwnedByMe: r.createdById === userId,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  }

  async findOne(tenantId: string, _userId: string, id: string) {
    const tpl = await this.prisma.tenderTemplate.findFirst({
      where: { id, tenantId },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    if (!tpl) throw new NotFoundException("Şablon bulunamadı");
    return tpl;
  }

  async create(tenantId: string, userId: string, dto: CreateTenderTemplateDto) {
    return this.prisma.tenderTemplate.create({
      data: {
        tenantId,
        createdById: userId,
        name: dto.name.trim(),
        data: dto.data as Prisma.InputJsonValue,
      },
      select: { id: true, name: true, createdAt: true, updatedAt: true },
    });
  }

  async delete(tenantId: string, userId: string, id: string) {
    const tpl = await this.prisma.tenderTemplate.findFirst({
      where: { id, tenantId },
      select: { id: true, createdById: true },
    });
    if (!tpl) throw new NotFoundException("Şablon bulunamadı");
    if (tpl.createdById !== userId) {
      throw new ForbiddenException("Sadece şablonu oluşturan silebilir");
    }
    await this.prisma.tenderTemplate.delete({ where: { id } });
    return { id };
  }
}
