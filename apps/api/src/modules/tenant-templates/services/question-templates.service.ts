import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../../common/prisma/prisma.service";
import type {
  CreateQuestionTemplateDto,
  UpdateQuestionTemplateDto,
} from "../dto/question-template.dto";

/**
 * V2-7+ — Kalem Sorusu Şablonları service'i.
 * isPublic=true → tenant içindeki tüm BUYER/COMPANY_ADMIN görür;
 * isPublic=false → sadece createdBy görür.
 */
@Injectable()
export class QuestionTemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string, userId: string) {
    const rows = await this.prisma.questionTemplate.findMany({
      where: {
        tenantId,
        OR: [{ isPublic: true }, { createdById: userId }],
      },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        _count: { select: { items: true } },
      },
      orderBy: { updatedAt: "desc" },
    });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      isPublic: r.isPublic,
      autoApply: r.autoApply,
      itemCount: r._count.items,
      createdBy: r.createdBy,
      isOwnedByMe: r.createdById === userId,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  }

  async findOne(tenantId: string, userId: string, id: string) {
    const tpl = await this.prisma.questionTemplate.findFirst({
      where: { id, tenantId },
      include: {
        items: { orderBy: { orderIndex: "asc" } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    if (!tpl) throw new NotFoundException("Şablon bulunamadı");
    if (!tpl.isPublic && tpl.createdById !== userId) {
      throw new ForbiddenException("Bu özel şablona erişim yetkiniz yok");
    }
    return {
      ...tpl,
      isOwnedByMe: tpl.createdById === userId,
    };
  }

  async create(
    tenantId: string,
    userId: string,
    dto: CreateQuestionTemplateDto,
  ) {
    return this.prisma.questionTemplate.create({
      data: {
        tenantId,
        createdById: userId,
        name: dto.name.trim(),
        isPublic: dto.isPublic,
        autoApply: dto.autoApply,
        items: {
          create: dto.items.map((it, index) => ({
            text: it.text.trim(),
            required: it.required,
            answerType: it.answerType,
            orderIndex: index,
          })),
        },
      },
      include: { items: { orderBy: { orderIndex: "asc" } } },
    });
  }

  async update(
    tenantId: string,
    userId: string,
    id: string,
    dto: UpdateQuestionTemplateDto,
  ) {
    const tpl = await this.prisma.questionTemplate.findFirst({
      where: { id, tenantId },
      select: { id: true, createdById: true },
    });
    if (!tpl) throw new NotFoundException("Şablon bulunamadı");
    // Sadece sahibi düzenleyebilir (public olsa bile başkası değiştiremez)
    if (tpl.createdById !== userId) {
      throw new ForbiddenException("Sadece şablonu oluşturan düzenleyebilir");
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.questionTemplate.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.isPublic !== undefined ? { isPublic: dto.isPublic } : {}),
          ...(dto.autoApply !== undefined ? { autoApply: dto.autoApply } : {}),
        },
      });
      if (dto.items) {
        await tx.questionTemplateItem.deleteMany({ where: { templateId: id } });
        await tx.questionTemplateItem.createMany({
          data: dto.items.map((it, index) => ({
            templateId: id,
            text: it.text.trim(),
            required: it.required,
            answerType: it.answerType,
            orderIndex: index,
          })),
        });
      }
      return tx.questionTemplate.findUniqueOrThrow({
        where: { id },
        include: { items: { orderBy: { orderIndex: "asc" } } },
      });
    });
  }

  async delete(tenantId: string, userId: string, id: string) {
    const tpl = await this.prisma.questionTemplate.findFirst({
      where: { id, tenantId },
      select: { id: true, createdById: true },
    });
    if (!tpl) throw new NotFoundException("Şablon bulunamadı");
    if (tpl.createdById !== userId) {
      throw new ForbiddenException("Sadece şablonu oluşturan silebilir");
    }
    await this.prisma.questionTemplate.delete({ where: { id } });
    return { id };
  }
}
