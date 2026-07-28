import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@rothern/db";
import { PrismaService } from "../../common/prisma/prisma.service";

interface QuestionItem {
  text: string;
  answerType: "TEXT" | "NUMBER" | "YES_NO" | "DATE";
  required?: boolean;
}

@Injectable()
export class CompanyQuestionTemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(companyId: string) {
    const rows = await this.prisma.listingQuestionTemplate.findMany({
      where: { companyId },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return rows.map((r) => {
      const items = Array.isArray(r.items)
        ? (r.items as { text?: string }[])
        : [];
      return {
        id: r.id,
        name: r.name,
        itemCount: items.length,
        createdAt: r.createdAt,
        // Kart önizlemesi: ilk 3 soru metni (liste zaten tam satırı çekiyor).
        preview: items
          .slice(0, 3)
          .map((i) => String(i?.text ?? ""))
          .filter(Boolean),
      };
    });
  }

  async getOne(companyId: string, id: string) {
    const row = await this.prisma.listingQuestionTemplate.findUnique({
      where: { id },
    });
    if (!row || row.companyId !== companyId) {
      throw new NotFoundException("Şablon bulunamadı");
    }
    const items = (row.items as unknown as QuestionItem[]) ?? [];
    return {
      id: row.id,
      name: row.name,
      // Modal seçimi için index-bazlı stabil id ekle.
      items: items.map((q, i) => ({ id: String(i), ...q })),
    };
  }

  async save(
    companyId: string,
    input: { name: string; items: QuestionItem[] },
  ) {
    if (!input.name?.trim()) {
      throw new BadRequestException("Şablon adı zorunlu");
    }
    if (!Array.isArray(input.items) || input.items.length === 0) {
      throw new BadRequestException("En az 1 soru gerekli");
    }
    const row = await this.prisma.listingQuestionTemplate.create({
      data: {
        companyId,
        name: input.name.trim().slice(0, 120),
        items: input.items.map((q) => ({
          text: q.text,
          answerType: q.answerType,
          required: q.required ?? false,
        })) as unknown as Prisma.InputJsonValue,
      },
    });
    return { id: row.id, name: row.name };
  }

  async remove(companyId: string, id: string) {
    const row = await this.prisma.listingQuestionTemplate.findUnique({
      where: { id },
      select: { id: true, companyId: true },
    });
    if (!row || row.companyId !== companyId) {
      throw new NotFoundException("Şablon bulunamadı");
    }
    await this.prisma.listingQuestionTemplate.delete({ where: { id } });
    return { ok: true };
  }
}
