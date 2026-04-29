import { Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@supkeys/db";
import { PrismaService } from "../../common/prisma/prisma.service";
import { ListEmailLogsDto } from "./dto/list-email-logs.dto";

@Injectable()
export class AdminEmailLogsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListEmailLogsDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const where: Prisma.EmailLogWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.template) where.template = query.template;
    if (query.toEmail) {
      where.toEmail = { contains: query.toEmail, mode: "insensitive" };
    }
    if (query.contextType) where.contextType = query.contextType;
    if (query.contextId) where.contextId = query.contextId;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.emailLog.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { queuedAt: "desc" },
      }),
      this.prisma.emailLog.count({ where }),
    ]);

    return {
      items,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async findOne(id: string) {
    const log = await this.prisma.emailLog.findUnique({ where: { id } });
    if (!log) {
      throw new NotFoundException("E-posta logu bulunamadı");
    }
    return log;
  }
}
